package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	gatewayURL  = "http://localhost:8080"
	defaultKey  = "ef_live_83b27b1029c34f3b890a5a297e61e05d"
	concurrency = 10
	totalEvents = 1000
)

type Event struct {
	EventID    string                 `json:"eventId"`
	ProjectID  string                 `json:"projectId"`
	UserID     string                 `json:"userId"`
	EventName  string                 `json:"eventName"`
	Properties map[string]interface{} `json:"properties"`
	Timestamp  string                 `json:"timestamp"`
}

func getAPIKey() string {
	connStr := "postgres://postgres:password@localhost:5432/auth_db?sslmode=disable"
	db, err := sql.Open("pgx", connStr)
	if err != nil {
		log.Printf("Warning: Failed to connect to auth_db: %v. Using default API key.", err)
		return defaultKey
	}
	defer db.Close()

	var apiKey string
	query := "SELECT api_key FROM api_keys WHERE is_active = true LIMIT 1"
	err = db.QueryRow(query).Scan(&apiKey)
	if err == nil {
		log.Printf("Found active API key in database: %s", apiKey)
		return apiKey
	}

	// No active API key exists (fresh database), let's seed a project and the default API key
	orgID := uuid.New()
	projID := uuid.New()
	keyID := uuid.New()

	_, err = db.Exec("INSERT INTO organizations (id, name) VALUES ($1, $2)", orgID, "Benchmark Org")
	if err != nil {
		log.Printf("Error seeding organization: %v", err)
		return defaultKey
	}

	_, err = db.Exec("INSERT INTO projects (id, name, organization_id) VALUES ($1, $2, $3)", projID, "Benchmark Project", orgID)
	if err != nil {
		log.Printf("Error seeding project: %v", err)
		return defaultKey
	}

	_, err = db.Exec("INSERT INTO api_keys (id, api_key, created_at, is_active, project_id) VALUES ($1, $2, $3, $4, $5)",
		keyID, defaultKey, time.Now(), true, projID)
	if err != nil {
		log.Printf("Error seeding api key: %v", err)
		return defaultKey
	}

	log.Printf("Successfully seeded default API key %s in database.", defaultKey)
	return defaultKey
}

func main() {
	apiKey := getAPIKey()

	log.Printf("Starting Ingestion Benchmark. Concurrency: %d, Total Events: %d", concurrency, totalEvents)
	start := time.Now()

	var wg sync.WaitGroup
	eventsPerWorker := totalEvents / concurrency
	latencies := make(chan time.Duration, totalEvents)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			client := &http.Client{Timeout: 5 * time.Second}

			for j := 0; j < eventsPerWorker; j++ {
				event := Event{
					EventID:   uuid.New().String(),
					UserID:    fmt.Sprintf("user_%d_%d", workerID, rand.Intn(100)),
					EventName: "benchmark_event",
					Properties: map[string]interface{}{
						"browser": "Chrome",
						"device":  "Desktop",
						"version": "120.0",
					},
					Timestamp: time.Now().Format(time.RFC3339),
				}

				body, _ := json.Marshal(event)

				reqStart := time.Now()
				req, err := http.NewRequest("POST", gatewayURL+"/events", bytes.NewBuffer(body))
				if err != nil {
					log.Printf("Error creating request: %v", err)
					continue
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-API-Key", apiKey)

				resp, err := client.Do(req)
				if err != nil {
					log.Printf("Error sending request: %v", err)
					continue
				}
				resp.Body.Close()

				if resp.StatusCode != http.StatusAccepted {
					log.Printf("Unexpected status code: %d", resp.StatusCode)
				} else {
					latencies <- time.Since(reqStart)
				}
			}
		}(i)
	}

	wg.Wait()
	close(latencies)

	duration := time.Since(start)
	totalSuccess := len(latencies)

	var totalLatency time.Duration
	for lat := range latencies {
		totalLatency += lat
	}

	avgLatency := time.Duration(0)
	if totalSuccess > 0 {
		avgLatency = totalLatency / time.Duration(totalSuccess)
	}

	fmt.Printf("\n--- Ingestion Pipeline Benchmark Results ---\n")
	fmt.Printf("Total Time:     %v\n", duration)
	fmt.Printf("Total Requests: %d\n", totalEvents)
	fmt.Printf("Successes:      %d\n", totalSuccess)
	fmt.Printf("Throughput:     %.2f req/sec\n", float64(totalSuccess)/duration.Seconds())
	fmt.Printf("Avg Latency:    %v\n", avgLatency)
	fmt.Printf("--------------------------------------------\n")
}
