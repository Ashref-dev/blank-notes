# Frontend build
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Go build
FROM golang:1.24-alpine AS api
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY api/ ./api/
COPY og/ ./og/
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Runtime: main.go serves web/dist and routes /api, /shared and /health to the Go handler
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=api /app/main ./main
COPY --from=web /app/web/dist ./web/dist
EXPOSE 8080
ENV PORT=8080
CMD ["./main"]
