package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/kinesis"
	kinesisTypes "github.com/aws/aws-sdk-go-v2/service/kinesis/types"
	"github.com/redis/go-redis/v9"
	"google.golang.org/protobuf/proto"
	pb "eventflow/ingestion-service/proto"
)

type IngestEventRequest struct {
	EventID    string                 `json:"eventId"`
	ProjectID  string                 `json:"projectId"`
	UserID     string                 `json:"userId"`
	EventName  string                 `json:"eventName"`
	Properties map[string]interface{} `json:"properties"`
	Timestamp  interface{}            `json:"timestamp"`
}

type cacheEntry struct {
	projectID string
	expiresAt time.Time
}

type L1Cache struct {
	mu    sync.RWMutex
	store map[string]cacheEntry
}

func (c *L1Cache) Get(key string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, found := c.store[key]
	if !found || time.Now().After(entry.expiresAt) {
		return "", false
	}
	return entry.projectID, true
}

func (c *L1Cache) Set(key string, projectID string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store[key] = cacheEntry{
		projectID: projectID,
		expiresAt: time.Now().Add(ttl),
	}
}

var (
	apiKeyL1Cache = &L1Cache{
		store: make(map[string]cacheEntry),
	}

	dbPool      *pgxpool.Pool
	redisClient *redis.Client
	kinesisClient *kinesis.Client
	streamName    string
	eventChannel  chan kinesisTypes.PutRecordsRequestEntry

	// Request structure pool to eliminate allocations on GC
	requestPool = sync.Pool{
		New: func() interface{} {
			return &IngestEventRequest{}
		},
	}

	// Byte buffer pool for zero-allocation JSON serialization
	bufferPool = sync.Pool{
		New: func() interface{} {
			return new(bytes.Buffer)
		},
	}

	// Prometheus metrics
	ingestionCounter = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "event_ingestion_rate",
			Help: "Total number of ingested events",
		},
		[]string{"projectId"},
	)
)

func init() {
	prometheus.MustRegister(ingestionCounter)
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func initClients() {
	ctx := context.Background()

	// 1. PostgreSQL DB Init
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPass := getEnv("DB_PASSWORD", "password")
	dbName := "auth_db"

	connStr := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", dbUser, dbPass, dbHost, dbPort, dbName)
	
	dbConfig, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		log.Fatalf("Unable to parse database config: %v", err)
	}
	
	// Tune connection pool settings similar to HikariCP
	dbConfig.MaxConns = 10                     // Maximum active connections
	dbConfig.MinConns = 2                      // Minimum idle connections
	dbConfig.MaxConnIdleTime = 5 * time.Minute // Idle connection timeout
	dbConfig.MaxConnLifetime = 30 * time.Minute // Max connection age
	
	dbPool, err = pgxpool.NewWithConfig(ctx, dbConfig)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}

	// Try pinging
	if err := dbPool.Ping(ctx); err != nil {
		log.Fatalf("Database ping failed: %v", err)
	}
	log.Println("Successfully connected to PostgreSQL (Tuned Pool)")

	// 2. Redis Init
	redisHost := getEnv("REDIS_HOST", "localhost")
	redisPort := getEnv("REDIS_PORT", "6379")
	redisClient = redis.NewClient(&redis.Options{
		Addr: fmt.Sprintf("%s:%s", redisHost, redisPort),
	})
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("Unable to connect to Redis: %v", err)
	}
	log.Println("Successfully connected to Redis")

	// 3. Kinesis Init
	streamName = getEnv("KINESIS_STREAM_NAME", "raw-events-stream")
	awsEndpoint := getEnv("AWS_ENDPOINT_URL", "http://localhost:4566")
	awsRegion := getEnv("AWS_REGION", "us-east-1")

	customHTTPClient := &http.Client{
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
			IdleConnTimeout:     90 * time.Second,
		},
		Timeout: 5 * time.Second,
	}

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(awsRegion),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider("mock-key", "mock-secret", "")),
		config.WithHTTPClient(customHTTPClient),
	)
	if err != nil {
		log.Fatalf("Unable to load SDK config, %v", err)
	}

	kinesisClient = kinesis.NewFromConfig(cfg, func(o *kinesis.Options) {
		if awsEndpoint != "" {
			o.BaseEndpoint = aws.String(awsEndpoint)
		}
	})
	log.Printf("Kinesis client initialized pointing to stream: %s at endpoint: %s", streamName, awsEndpoint)

	eventChannel = make(chan kinesisTypes.PutRecordsRequestEntry, 10000)
	go startKinesisBatchWriter(context.Background())
}

func validateAPIKeyAndGetProjectID(ctx context.Context, apiKey string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("API key is missing")
	}

	// 1. Check L1 Cache first (in-memory, 0-network cost)
	if projectID, found := apiKeyL1Cache.Get(apiKey); found {
		return projectID, nil
	}

	cacheKey := "apikey:" + apiKey
	cachedVal, err := redisClient.Get(ctx, cacheKey).Result()
	if err == nil && cachedVal != "" {
		// If it's the legacy value "valid" (which doesn't contain project ID), fall through to Postgres lookup
		if cachedVal != "valid" {
			// Populate L1 cache for subsequent requests (1-minute TTL)
			apiKeyL1Cache.Set(apiKey, cachedVal, 1*time.Minute)
			return cachedVal, nil
		}
	}

	// DB Fallback on cache miss
	var projectID string
	var isActive bool
	query := "SELECT project_id, is_active FROM api_keys WHERE api_key = $1"
	err = dbPool.QueryRow(ctx, query, apiKey).Scan(&projectID, &isActive)
	if err != nil {
		return "", fmt.Errorf("Invalid API key")
	}

	if !isActive {
		return "", fmt.Errorf("API key has been revoked")
	}

	// Cache in L1 cache (1-minute TTL)
	apiKeyL1Cache.Set(apiKey, projectID, 1*time.Minute)

	// Cache the projectID instead of just "valid" with 30 days TTL in Redis
	err = redisClient.Set(ctx, cacheKey, projectID, 30*24*time.Hour).Err()
	if err != nil {
		log.Printf("Warning: Failed to cache API key in Redis: %v", err)
	}

	return projectID, nil
}

func handleIngest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()

	// Extract API Key
	apiKey := r.Header.Get("X-API-Key")
	if apiKey == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			apiKey = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	// Validate API Key
	projectID, err := validateAPIKeyAndGetProjectID(ctx, apiKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// Acquire request structure from pool
	req := requestPool.Get().(*IngestEventRequest)
	defer func() {
		// Reset fields to avoid leakage or stale data in subsequent pool reuses
		req.EventID = ""
		req.ProjectID = ""
		req.UserID = ""
		req.EventName = ""
		req.Properties = nil
		req.Timestamp = nil
		requestPool.Put(req)
	}()

	// Decode body into pooled structure
	if err := json.NewDecoder(r.Body).Decode(req); err != nil {
		http.Error(w, "Invalid request JSON", http.StatusBadRequest)
		return
	}

	// Validate schema fields
	if _, err := uuid.Parse(req.EventID); err != nil {
		http.Error(w, "eventId is required and must be a valid UUID", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.EventName) == "" {
		http.Error(w, "eventName is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.UserID) == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}
	if req.Timestamp == nil {
		http.Error(w, "timestamp is required", http.StatusBadRequest)
		return
	}

	// Force project ID to match the authenticated API key's project ID
	req.ProjectID = projectID

	// Check idempotency
	idempotencyKey := "idempotency:" + req.EventID
	isDuplicate, err := redisClient.Exists(ctx, idempotencyKey).Result()
	if err != nil {
		log.Printf("Redis check error: %v", err)
	}
	if isDuplicate > 0 {
		http.Error(w, "Duplicate event detected (Conflict)", http.StatusConflict)
		return
	}

	// Set idempotency key (24-hour TTL)
	err = redisClient.Set(ctx, idempotencyKey, "processed", 24*time.Hour).Err()
	if err != nil {
		log.Printf("Warning: Failed to set idempotency key: %v", err)
	}

	// Serialize properties map to JSON string
	propertiesJSONBytes, err := json.Marshal(req.Properties)
	if err != nil {
		redisClient.Del(ctx, idempotencyKey)
		http.Error(w, "Serialization error (properties)", http.StatusInternalServerError)
		return
	}

	// Parse timestamp to Unix milliseconds
	var timestampMillis int64 = time.Now().UnixNano() / 1e6
	if req.Timestamp != nil {
		if tsStr, ok := req.Timestamp.(string); ok {
			if parsedTime, err := time.Parse(time.RFC3339, tsStr); err == nil {
				timestampMillis = parsedTime.UnixNano() / 1e6
			}
		} else if tsNum, ok := req.Timestamp.(float64); ok {
			timestampMillis = int64(tsNum)
		}
	}

	// Populate Protobuf object
	protoEvent := &pb.AnalyticsEventProto{
		EventId:         req.EventID,
		ProjectId:       req.ProjectID,
		UserId:          req.UserID,
		EventName:       req.EventName,
		PropertiesJson:  string(propertiesJSONBytes),
		TimestampMillis: timestampMillis,
	}

	// Marshal to binary Protobuf
	payloadBytes, err := proto.Marshal(protoEvent)
	if err != nil {
		redisClient.Del(ctx, idempotencyKey)
		http.Error(w, "Serialization error (protobuf)", http.StatusInternalServerError)
		return
	}

	// Push to batch writer channel
	eventChannel <- kinesisTypes.PutRecordsRequestEntry{
		PartitionKey: aws.String(req.UserID),
		Data:         payloadBytes,
	}

	// Metric increment
	ingestionCounter.WithLabelValues(projectID).Inc()

	w.WriteHeader(http.StatusAccepted)
}

func startKinesisBatchWriter(ctx context.Context) {
	log.Println("Starting background Kinesis batch writer worker...")
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	var batch []kinesisTypes.PutRecordsRequestEntry
	const maxBatchSize = 500

	flush := func() {
		if len(batch) == 0 {
			return
		}
		
		_, err := kinesisClient.PutRecords(ctx, &kinesis.PutRecordsInput{
			StreamName: aws.String(streamName),
			Records:    batch,
		})
		if err != nil {
			log.Printf("Background Kinesis PutRecords batch write failed: %v", err)
		}
		// Reset batch keeping pre-allocated slice memory
		batch = batch[:0]
	}

	for {
		select {
		case entry, ok := <-eventChannel:
			if !ok {
				flush()
				return
			}
			batch = append(batch, entry)
			if len(batch) >= maxBatchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-ctx.Done():
			flush()
			return
		}
	}
}

func main() {
	initClients()
	defer dbPool.Close()

	http.HandleFunc("/events", handleIngest)
	http.Handle("/metrics", promhttp.Handler())

	port := getEnv("PORT", "8082")
	log.Printf("Go Ingestion Service listening on port %s...", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
