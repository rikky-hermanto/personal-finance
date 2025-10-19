FROM golang:1.21-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags '-extldflags "-static"' -o personal-finance-api cmd/server/main.go

# Final stage
FROM alpine:latest

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates curl tzdata

# Create app user
RUN addgroup -g 1001 -S app && \
    adduser -S app -u 1001

# Set working directory
WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/personal-finance-api .
COPY --from=builder /app/configs ./configs
COPY --from=builder /app/migrations ./migrations

# Create directories for uploads and logs
RUN mkdir -p uploads logs && \
    chown -R app:app /app

# Switch to app user
USER app

# Expose port
EXPOSE 7208

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:7208/api/transactions/health || exit 1

# Run the binary
CMD ["./personal-finance-api"]