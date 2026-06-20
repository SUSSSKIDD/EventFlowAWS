package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"runtime"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	defaultGatewayURL   = "http://localhost:8080"
	defaultAuthURL      = "http://localhost:8081"
	defaultReportingURL = "http://localhost:8084"
	defaultKey          = "ef_live_83b27b1029c34f3b890a5a297e61e05d"
)

var (
	registeredUsers   []string
	registeredUsersMu sync.RWMutex
)

type Event struct {
	EventID    string                 `json:"eventId"`
	ProjectID  string                 `json:"projectId"`
	UserID     string                 `json:"userId"`
	EventName  string                 `json:"eventName"`
	Properties map[string]interface{} `json:"properties"`
	Timestamp  string                 `json:"timestamp"`
}

type LatencyStats struct {
	P50 time.Duration
	P90 time.Duration
	P99 time.Duration
	Min time.Duration
	Max time.Duration
}

type EndpointMetrics struct {
	Name       string
	Successes  int
	Failures   int
	Latencies  []time.Duration
	StatusMap  map[int]int
	mu         sync.Mutex
}

func (em *EndpointMetrics) Record(duration time.Duration, status int, success bool) {
	em.mu.Lock()
	defer em.mu.Unlock()
	if success {
		em.Successes++
	} else {
		em.Failures++
	}
	em.Latencies = append(em.Latencies, duration)
	em.StatusMap[status]++
}

func (em *EndpointMetrics) CalculateStats() LatencyStats {
	em.mu.Lock()
	defer em.mu.Unlock()
	
	n := len(em.Latencies)
	if n == 0 {
		return LatencyStats{}
	}

	sorted := make([]time.Duration, n)
	copy(sorted, em.Latencies)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i] < sorted[j]
	})

	return LatencyStats{
		Min: sorted[0],
		Max: sorted[n-1],
		P50: sorted[n/2],
		P90: sorted[int(float64(n)*0.90)],
		P99: sorted[int(float64(n)*0.99)],
	}
}

func getAPIKeyAndProject(authDbURL string) (string, string) {
	db, err := sql.Open("pgx", authDbURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to auth_db: %v. Using defaults.", err)
		return defaultKey, "81d3bbf0-8e2f-426d-a6ed-dedd64a9aed7"
	}
	defer db.Close()

	var apiKey string
	var projectID string
	query := "SELECT api_key, project_id FROM api_keys WHERE is_active = true LIMIT 1"
	err = db.QueryRow(query).Scan(&apiKey, &projectID)
	if err == nil {
		return apiKey, projectID
	}

	var pID string
	err = db.QueryRow("SELECT id FROM projects LIMIT 1").Scan(&pID)
	if err != nil {
		pID = "81d3bbf0-8e2f-426d-a6ed-dedd64a9aed7"
	}
	return defaultKey, pID
}

func logMemStats(label string) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	fmt.Printf("\n📊 [Resource Monitor - %s]\n", label)
	fmt.Printf("   ├── Active Goroutines: %d\n", runtime.NumGoroutine())
	fmt.Printf("   ├── Heap Allocated:    %.2f MB\n", float64(m.HeapAlloc)/(1024*1024))
	fmt.Printf("   ├── Total Sys Memory:  %.2f MB\n", float64(m.Sys)/(1024*1024))
	fmt.Printf("   └── GC Cycle Count:    %d\n", m.NumGC)
}

func main() {
	concurrencyFlag := flag.Int("c", 20, "Concurrency limit (number of worker goroutines)")
	durationFlag := flag.Duration("d", 10*time.Second, "Test duration (e.g. 10s, 30s, 1m)")
	rpsFlag := flag.Int("rps", 0, "Target request rate (Requests Per Second) - 0 for unlimited speed")
	chaosRateFlag := flag.Float64("chaos", 0.0, "Chaos failure injection rate (0.0 to 1.0, e.g. 0.1 for 10% bad inputs)")
	
	gatewayURL := flag.String("gateway", defaultGatewayURL, "API Gateway base URL")
	authURL := flag.String("auth", defaultAuthURL, "Auth Service base URL")
	reportingURL := flag.String("reporting", defaultReportingURL, "Reporting Service base URL")
	dbURL := flag.String("db", "postgres://postgres:password@localhost:5432/auth_db?sslmode=disable", "Auth database URL")
	flag.Parse()

	apiKey, projectID := getAPIKeyAndProject(*dbURL)
	log.Printf("🔥 Starting Production Stress Test & Chaos Simulator:")
	log.Printf("  ↳ Concurrency Limit: %d", *concurrencyFlag)
	log.Printf("  ↳ Test Duration:     %v", *durationFlag)
	if *rpsFlag > 0 {
		log.Printf("  ↳ Target Rate:       %d RPS", *rpsFlag)
	} else {
		log.Printf("  ↳ Target Rate:       Max Speed (Unlimited)")
	}
	log.Printf("  ↳ Chaos Injection:   %.1f%% request payload corruption", *chaosRateFlag * 100)

	logMemStats("START")

	metrics := map[string]*EndpointMetrics{
		"Ingest": {
			Name:      "Ingest (Go)",
			StatusMap: make(map[int]int),
		},
		"Register": {
			Name:      "Register (Auth)",
			StatusMap: make(map[int]int),
		},
		"Login": {
			Name:      "Login (Auth)",
			StatusMap: make(map[int]int),
		},
		"GetReports": {
			Name:      "Get Reports (Reporting)",
			StatusMap: make(map[int]int),
		},
		"GenerateReport": {
			Name:      "Generate Report (Reporting)",
			StatusMap: make(map[int]int),
		},
	}

	client := &http.Client{
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
			IdleConnTimeout:     30 * time.Second,
		},
		Timeout: 6 * time.Second,
	}

	start := time.Now()
	testTimeout := time.After(*durationFlag)
	
	// Channels for work orchestration
	jobs := make(chan string, 1000)
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < *concurrencyFlag; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				// Inject chaos/failure payload
				injectChaos := rand.Float64() < *chaosRateFlag
				executeJob(client, job, apiKey, projectID, *gatewayURL, *authURL, *reportingURL, injectChaos, metrics)
			}
		}()
	}

	// Work generator loop with optional rate limiting (RPS throttling)
	var ticker *time.Ticker
	var useRPS = *rpsFlag > 0
	if useRPS {
		interval := time.Second / time.Duration(*rpsFlag)
		ticker = time.NewTicker(interval)
		defer ticker.Stop()
	}

	totalOperations := 0
	running := true

	for running {
		select {
		case <-testTimeout:
			running = false
		default:
			if useRPS {
				<-ticker.C
			}
			
			// Distribute tasks
			r := rand.Float64()
			var job string
			if r < 0.65 {
				job = "Ingest"
			} else if r < 0.80 {
				job = "Login"
			} else if r < 0.85 {
				job = "Register"
			} else if r < 0.95 {
				job = "GetReports"
			} else {
				job = "GenerateReport"
			}

			// Non-blocking select to push job or drop if channel backed up
			select {
			case jobs <- job:
				totalOperations++
			default:
				// Worker pool is saturated (Backpressure simulation)
				// Gracefully throttle to avoid OOM
				time.Sleep(1 * time.Millisecond)
			}
		}
	}

	close(jobs)
	wg.Wait()
	duration := time.Since(start)

	logMemStats("END")
	printReport(metrics, duration, totalOperations)
}

func executeJob(client *http.Client, job string, apiKey string, projectID string, gatewayURL string, authURL string, reportingURL string, injectChaos bool, metrics map[string]*EndpointMetrics) {
	var (
		req         *http.Request
		err         error
		target      = metrics[job]
		customEmail string
	)

	// Local failure injection simulation
	apiKeyToUse := apiKey
	projectIDToUse := projectID
	if injectChaos {
		if rand.Float64() < 0.5 {
			apiKeyToUse = "invalid_corrupted_api_key_chaos"
		} else {
			projectIDToUse = uuid.New().String() // invalid project UUID scope
		}
	}

	start := time.Now()

	switch job {
	case "Ingest":
		// Payload corruption simulation for Ingest
		eventID := uuid.New().String()
		if injectChaos {
			eventID = "malformed-non-uuid-string"
		}
		
		event := Event{
			EventID:   eventID,
			UserID:    fmt.Sprintf("stress_user_%d", rand.Intn(1000)),
			EventName: "stress_test_event",
			Properties: map[string]interface{}{
				"load_test": true,
				"chaos":     injectChaos,
			},
			Timestamp: time.Now().Format(time.RFC3339),
		}
		body, _ := json.Marshal(event)
		req, err = http.NewRequest("POST", gatewayURL+"/events", bytes.NewBuffer(body))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-API-Key", apiKeyToUse)
		}

	case "Register":
		customEmail = fmt.Sprintf("stress_%d@eventflow.io", rand.Int63())
		regPayload := map[string]string{
			"email":    customEmail,
			"password": "secure_password",
			"orgName":  "Chaos Org",
		}
		body, _ := json.Marshal(regPayload)
		req, err = http.NewRequest("POST", authURL+"/auth/register", bytes.NewBuffer(body))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
		}

	case "Login":
		email := "stress_seeded@eventflow.io"
		registeredUsersMu.RLock()
		if len(registeredUsers) > 0 {
			email = registeredUsers[rand.Intn(len(registeredUsers))]
		}
		registeredUsersMu.RUnlock()

		password := "secure_password"
		if injectChaos {
			password = "wrong_password_chaos"
		}

		loginPayload := map[string]string{
			"email":    email,
			"password": password,
		}
		body, _ := json.Marshal(loginPayload)
		req, err = http.NewRequest("POST", authURL+"/auth/login", bytes.NewBuffer(body))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
		}

	case "GetReports":
		req, err = http.NewRequest("GET", reportingURL+"/reports", nil)
		if err == nil {
			req.Header.Set("X-Project-Id", projectIDToUse)
		}

	case "GenerateReport":
		end := time.Now().Format("2006-01-02")
		start := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
		urlStr := fmt.Sprintf("%s/reports/generate?start=%s&end=%s", reportingURL, start, end)
		req, err = http.NewRequest("POST", urlStr, nil)
		if err == nil {
			req.Header.Set("X-Project-Id", projectIDToUse)
		}
	}

	if err != nil {
		target.Record(time.Since(start), 0, false)
		return
	}

	resp, err := client.Do(req)
	if err != nil {
		target.Record(time.Since(start), 503, false)
		return
	}
	defer resp.Body.Close()

	_, _ = io.Copy(io.Discard, resp.Body)

	success := resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusAccepted || resp.StatusCode == http.StatusCreated
	target.Record(time.Since(start), resp.StatusCode, success)

	if success && job == "Register" && customEmail != "" {
		registeredUsersMu.Lock()
		registeredUsers = append(registeredUsers, customEmail)
		registeredUsersMu.Unlock()
	}
}

func printReport(metrics map[string]*EndpointMetrics, totalTime time.Duration, totalRequests int) {
	fmt.Printf("\n===========================================================\n")
	fmt.Printf("🔥 CHAOS ENGINEERING & MULTI-SERVICE STRESS TEST RESULTS\n")
	fmt.Printf("===========================================================\n")
	fmt.Printf("Total Test Time:  %v\n", totalTime)
	fmt.Printf("Total Requests Executed: %d\n", totalRequests)
	fmt.Printf("Global Throughput: %.2f operations/sec\n\n", float64(totalRequests)/totalTime.Seconds())

	keys := []string{"Ingest", "Register", "Login", "GetReports", "GenerateReport"}

	for _, key := range keys {
		m := metrics[key]
		stats := m.CalculateStats()
		total := m.Successes + m.Failures

		fmt.Printf("● %s:\n", m.Name)
		fmt.Printf("  ├── Total Requests: %d\n", total)
		fmt.Printf("  ├── Success Rate:   %d / %d (%.2f%%)\n", m.Successes, total, percent(m.Successes, total))
		fmt.Printf("  ├── Latency stats:\n")
		fmt.Printf("  │     ├── Min: %v\n", stats.Min)
		fmt.Printf("  │     ├── P50: %v\n", stats.P50)
		fmt.Printf("  │     ├── P90: %v\n", stats.P90)
		fmt.Printf("  │     ├── P99: %v\n", stats.P99)
		fmt.Printf("  │     └── Max: %v\n", stats.Max)
		
		statusStr := ""
		for status, count := range m.StatusMap {
			statusStr += fmt.Sprintf(" %d:%d", status, count)
		}
		fmt.Printf("  └── Status Codes:   %s\n\n", statusStr)
	}
	fmt.Printf("===========================================================\n")
}

func percent(part, total int) float64 {
	if total == 0 {
		return 0
	}
	return (float64(part) / float64(total)) * 100
}
