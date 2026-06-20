# EventFlow AWS Platform: Dockerization & Containerization Guide

This guide explains how to containerize the migrated EventFlow AWS platform. It includes highly optimized, production-grade, multi-stage Dockerfiles for the Go, Java, and Next.js services, along with a unified `docker-compose.yml` configuration for a fully containerized local deploy.

---

## 🚀 1. Optimized Microservice Dockerfiles

### 🔹 Go Services (`gateway-go` & `ingestion-service-go`)
Go binaries do not require a heavy runtime environment. We use a **multi-stage build** compiled statically with CGO disabled, copying the binary into a Google **Distroless** static image.
* **Resulting Image Size**: **~15MB** (instead of 800MB+ for standard Go SDK images).
* **Security**: Distroless contains zero shell tools or package managers, minimizing security attack surface.

Create the file `Dockerfile` inside `server/gateway-go/` and `server/ingestion-service-go/`:
```dockerfile
# --- Build Stage ---
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Cache dependencies separately
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o main .

# --- Production Stage ---
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /
COPY --from=builder /app/main /main

USER nonroot:nonroot
EXPOSE 8080

ENTRYPOINT ["/main"]
```

---

### ☕ Java Spring Boot Services (`auth-service`, `analytics-service`, `reporting-service`)
Standard Gradle/JDK base images are bloated and slow. We compile the code inside a Gradle build stage and run it using a minimal **Eclipse Temurin Alpine JRE** base image.
* **Resulting Image Size**: **~150MB** (instead of 600MB+ for full JDK images).
* **Performance**: We configure JVM flags to optimize garbage collection (`G1GC`) and respect container memory limits.

Create the file `Dockerfile` inside `server/auth-service/`, `server/analytics-service/`, and `server/reporting-service/`:
```dockerfile
# --- Build Stage ---
FROM gradle:8.7-jdk21-alpine AS builder
WORKDIR /home/gradle/src
COPY --chown=gradle:gradle . .
RUN gradle build -x test --no-daemon

# --- Production Stage ---
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Copy built boot jar from build stage
COPY --from=builder /home/gradle/src/build/libs/*.jar app.jar

# Run as non-privileged system user for security
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# Optimized JVM runtime flags for memory constraint environments
ENTRYPOINT ["java", "-XX:+UseG1GC", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

---

### 💻 Next.js Frontend (`client`)
Standard Next.js containers can easily reach **1.2GB** due to heavy dependencies (`node_modules`) and build tools. We utilize the Next.js **Standalone Output** feature to build and export only the required runtime files.
* **Requirement**: Ensure `output: 'standalone'` is added to `next.config.js` (or `next.config.mjs`).
* **Resulting Image Size**: **~120MB**.

Create the file `Dockerfile` inside the `client/` directory:
```dockerfile
# --- Stage 1: Install Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- Stage 2: Build Application ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Stage 3: Lightweight Runner ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
```

---

## 📦 2. Fully Containerized `docker-compose.yml`

This optimized configuration links the database, caching layer, LocalStack, and all application microservices together into a single virtual network.

Replace the contents of `server/docker-compose.yml` with:
```yaml
version: '3.8'

services:
  # --- Infrastructure Services ---
  postgres:
    image: postgres:16-alpine
    container_name: eventflow-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_MULTIPLE_DATABASES: auth_db,analytics_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - eventflow-network

  redis:
    image: redis:7-alpine
    container_name: eventflow-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - eventflow-network

  localstack:
    image: localstack/localstack:3.4
    container_name: eventflow-localstack
    ports:
      - "4566:4566"
    environment:
      - SERVICES=kinesis,s3
      - AWS_DEFAULT_REGION=us-east-1
    volumes:
      - localstack_data:/var/lib/localstack
      - ./docker/localstack:/etc/localstack/init/ready.d
    networks:
      - eventflow-network

  # --- Application Microservices ---
  gateway-go:
    build:
      context: ./gateway-go
    container_name: eventflow-gateway
    ports:
      - "8080:8080"
    environment:
      - AUTH_SERVICE_URL=http://auth-service:8081
      - INGESTION_SERVICE_URL=http://ingestion-service-go:8082
    depends_on:
      - auth-service
    networks:
      - eventflow-network

  auth-service:
    build:
      context: ./auth-service
    container_name: eventflow-auth-service
    ports:
      - "8081:8081"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/auth_db
      - SPRING_DATASOURCE_USERNAME=postgres
      - SPRING_DATASOURCE_PASSWORD=password
      - SPRING_DATA_REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    networks:
      - eventflow-network

  ingestion-service-go:
    build:
      context: ./ingestion-service-go
    container_name: eventflow-ingestion-service
    ports:
      - "8082:8082"
    environment:
      - AUTH_SERVICE_URL=http://auth-service:8081
      - AWS_ENDPOINT_URL=http://localstack:4566
      - AWS_REGION=us-east-1
      - KINESIS_STREAM_NAME=raw-events-stream
    depends_on:
      - auth-service
      - localstack
    networks:
      - eventflow-network

  analytics-service:
    build:
      context: ./analytics-service
    container_name: eventflow-analytics-service
    ports:
      - "8083:8083"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USER=postgres
      - DB_PASSWORD=password
      - REDIS_HOST=redis
      - AWS_ENDPOINT_URL=http://localstack:4566
      - AWS_REGION=us-east-1
      - KINESIS_STREAM_NAME=raw-events-stream
    depends_on:
      - postgres
      - redis
      - localstack
    networks:
      - eventflow-network

  reporting-service:
    build:
      context: ./reporting-service
    container_name: eventflow-reporting-service
    ports:
      - "8084:8084"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USER=postgres
      - DB_PASSWORD=password
    depends_on:
      - postgres
    networks:
      - eventflow-network

  # --- Frontend Client ---
  client:
    build:
      context: ../client
    container_name: eventflow-client
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_GATEWAY_URL=http://gateway-go:8080
    depends_on:
      - gateway-go
    networks:
      - eventflow-network

volumes:
  postgres_data:
  redis_data:
  localstack_data:

networks:
  eventflow-network:
    name: eventflow-network
    driver: bridge
```

---

## 🛠️ 3. Execution Commands

### Build and Run All Services
To build the optimized images and start the platform containerized:
```bash
docker compose -f server/docker-compose.yml up -d --build
```

### Check Logs
To stream consolidated logs:
```bash
docker compose -f server/docker-compose.yml logs -f
```

### Stop All Services
```bash
docker compose -f server/docker-compose.yml down -v
```
