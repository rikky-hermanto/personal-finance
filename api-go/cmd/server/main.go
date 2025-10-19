package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Version   string    `json:"version"`
	Service   string    `json:"service"`
}

func main() {
	// Set Gin mode based on environment
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router
	router := gin.New()

	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	// CORS configuration
	config := cors.DefaultConfig()
	corsOrigins := os.Getenv("PF_SERVER_CORS_ALLOWED_ORIGINS")
	if corsOrigins == "" {
		corsOrigins = "http://localhost:8080"
	}
	config.AllowOrigins = []string{corsOrigins}
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"*"}
	config.ExposeHeaders = []string{"*"}
	config.AllowCredentials = true
	router.Use(cors.New(config))

	// Health check endpoint
	router.GET("/api/transactions/health", healthCheckHandler)

	// Root endpoint
	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "Personal Finance API - Go Implementation",
			"health":  "/api/transactions/health",
			"docs":    "https://github.com/rikky-hermanto/personal-finance/blob/main/docs/Go-API-Implementation.md",
		})
	})

	// Get port from environment or use default
	port := os.Getenv("PF_SERVER_PORT")
	if port == "" {
		port = "7208"
	}

	// Log startup information
	fmt.Printf("🚀 Personal Finance API starting...\n")
	fmt.Printf("📍 Server running on port %s\n", port)
	fmt.Printf("🔗 Health check: http://localhost:%s/api/transactions/health\n", port)
	fmt.Printf("🌐 CORS enabled for: %s\n", corsOrigins)

	// Start server
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// healthCheckHandler handles the health check endpoint
func healthCheckHandler(c *gin.Context) {
	response := HealthResponse{
		Status:    "Healthy",
		Timestamp: time.Now(),
		Version:   "1.0.0",
		Service:   "Personal Finance API (Go)",
	}

	c.JSON(http.StatusOK, response)
}