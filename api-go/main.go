package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {
	// Create a new Gin router
	r := gin.Default()

	// Define a simple Hello World route
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "Hello World from Go API!",
			"version": "1.0.0",
		})
	})

	// Start the server on port 7209 (to avoid conflict with C# API)
	port := ":7209"
	log.Printf("🚀 Go API starting on http://localhost%s", port)
	log.Printf("📍 Health check: http://localhost%s/", port)

	if err := r.Run(port); err != nil {
		log.Fatal("❌ Failed to start server:", err)
	}
}