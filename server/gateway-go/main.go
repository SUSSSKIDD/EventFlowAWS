package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

var (
	jwtSecret          []byte
	authServiceURL     *url.URL
	ingestionServiceURL *url.URL
	analyticsServiceURL *url.URL
	reportingServiceURL *url.URL

	authProxy      *httputil.ReverseProxy
	ingestionProxy *httputil.ReverseProxy
	analyticsProxy *httputil.ReverseProxy
	reportingProxy *httputil.ReverseProxy
)

func init() {
	secretStr := os.Getenv("JWT_SECRET")
	if secretStr == "" {
		secretStr = "9a4f2c8d3b7a1e5f8c6d2b4a7e9f1c3d5b7a9e1f3c5d7b9a2f4c6d8e0a2b4c6d"
	}
	jwtSecret = []byte(secretStr)

	authServiceURL = parseURL(getEnv("AUTH_SERVICE_URL", "http://localhost:8081"))
	ingestionServiceURL = parseURL(getEnv("INGESTION_SERVICE_URL", "http://localhost:8082"))
	analyticsServiceURL = parseURL(getEnv("ANALYTICS_SERVICE_URL", "http://localhost:8083"))
	reportingServiceURL = parseURL(getEnv("REPORTING_SERVICE_URL", "http://localhost:8084"))

	authProxy = httputil.NewSingleHostReverseProxy(authServiceURL)
	ingestionProxy = httputil.NewSingleHostReverseProxy(ingestionServiceURL)
	analyticsProxy = httputil.NewSingleHostReverseProxy(analyticsServiceURL)
	reportingProxy = httputil.NewSingleHostReverseProxy(reportingServiceURL)
}

func parseURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		log.Fatalf("Failed to parse URL %s: %v", raw, err)
	}
	return u
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func handleCORS(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Project-Id")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return true
	}
	return false
}

func validateJWTAndGetProjectID(authHeader string) (string, error) {
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return "", fmt.Errorf("missing or invalid authorization header format")
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return "", err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		projID, exists := claims["projectId"]
		if !exists {
			return "", fmt.Errorf("projectId claim not found in token")
		}
		projIDStr, ok := projID.(string)
		if !ok || projIDStr == "" {
			return "", fmt.Errorf("projectId claim is empty or invalid")
		}
		return projIDStr, nil
	}

	return "", fmt.Errorf("invalid token")
}

func mainHandler(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}

	// Sanitize incoming headers to prevent header-injection / spoofing
	r.Header.Del("X-Project-Id")

	path := r.URL.Path
	if path == "/swagger.json" {
		w.Header().Set("Content-Type", "application/json")
		http.ServeFile(w, r, "swagger.json")
		return
	}

	var targetProxy *httputil.ReverseProxy
	requiresAuth := true

	if strings.HasPrefix(path, "/auth/") {
		targetProxy = authProxy
		requiresAuth = false
	} else if strings.HasPrefix(path, "/projects/") || strings.HasPrefix(path, "/apikeys/") {
		targetProxy = authProxy
		requiresAuth = true
	} else if strings.HasPrefix(path, "/events/") || path == "/events" {
		targetProxy = ingestionProxy
		requiresAuth = false // API key validation happens in Ingestion Service
	} else if strings.HasPrefix(path, "/analytics/") {
		targetProxy = analyticsProxy
		requiresAuth = true
	} else if strings.HasPrefix(path, "/reports") || strings.HasPrefix(path, "/reports/") {
		targetProxy = reportingProxy
		requiresAuth = true
	} else {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	if requiresAuth {
		authHeader := r.Header.Get("Authorization")
		projectID, err := validateJWTAndGetProjectID(authHeader)
		if err != nil {
			log.Printf("Auth verification failed for %s: %v", path, err)
			http.Error(w, "Unauthorized: "+err.Error(), http.StatusUnauthorized)
			return
		}
		// Inject the verified project ID header for downstream services
		r.Header.Set("X-Project-Id", projectID)
	}

	targetProxy.ServeHTTP(w, r)
}

func main() {
	port := getEnv("PORT", "8080")
	http.HandleFunc("/", mainHandler)

	log.Printf("Go Gateway listening on port %s...", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
