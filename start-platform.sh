#!/bin/bash

# EventFlow Analytics Platform Startup Script
# Boots up Docker, all Spring Boot microservices, and the Next.js frontend concurrently.

# Exit handler: Terminate all background processes on Ctrl+C (SIGINT / EXIT)
cleanup() {
    echo -e "\n🛑 Stopping all EventFlow services..."
    # Kill all child processes of this shell script session
    kill 0
    exit 0
}
trap cleanup SIGINT SIGTERM

echo "🚀 Starting EventFlow Analytics Infrastructure..."

# 1. Start Docker Containers
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker daemon is not running. Please start Docker Desktop or Colima first."
    exit 1
fi

echo "📦 Spinning up PostgreSQL, Redis, and LocalStack..."
docker compose -f server/docker-compose.yml up -d
# Initialize / clear consolidated log file at root
> platform.log

echo "⏳ Waiting for LocalStack to initialize..."
until curl -s http://localhost:4566/_localstack/health | grep -q '"kinesis": "available"\|"kinesis": "running"'; do
  echo "  ↳ Waiting for LocalStack Kinesis service..."
  sleep 2
done
echo "✅ LocalStack is ready!"

# 2. Start Backend Spring Boot Microservices
echo "☕ Starting Java microservices (Gradle)..."

# Run bootRun for each module in the background
cd server
(cd gateway-go && go run main.go) >> ../platform.log 2>&1 &
echo "  ↳ Started API Gateway [Go] (port 8080) in background (logs: platform.log)"

gradle :auth-service:bootRun >> ../platform.log 2>&1 &
echo "  ↳ Started Auth Service (port 8081) in background (logs: platform.log)"

(cd ingestion-service-go && go run main.go) >> ../platform.log 2>&1 &
echo "  ↳ Started Ingestion Service [Go] (port 8082) in background (logs: platform.log)"

gradle :analytics-service:bootRun >> ../platform.log 2>&1 &
echo "  ↳ Started Analytics Service (port 8083) in background (logs: platform.log)"

gradle :reporting-service:bootRun >> ../platform.log 2>&1 &
echo "  ↳ Started Reporting Service (port 8084) in background (logs: platform.log)"

cd ..

# 3. Start Next.js Frontend
echo "💻 Starting Next.js Frontend (port 3000)..."
cd client
npm run dev >> ../platform.log 2>&1 &
cd ..

echo -e "\n🎉 All services are starting up! Open http://localhost:3000 to access the Dashboard."
echo "📝 All outputs and logs are consolidated in: platform.log"
echo "Press Ctrl+C to stop all services simultaneously."

# Keep script running to listen for Ctrl+C
wait
