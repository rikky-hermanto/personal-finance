package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Database connection
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_USER", "postgres"),
		getEnv("DB_PASSWORD", "postgres123"),
		getEnv("DB_NAME", "personal_finance"),
		getEnv("DB_PORT", "5432"),
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto migrate the schema
	err = db.AutoMigrate(&Transaction{}, &CategoryRule{})
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Initialize handlers
	transactionHandler := NewTransactionHandler(db)
	categoryRuleHandler := NewCategoryRuleHandler(db)

	// Setup Gin router
	r := gin.Default()

	// CORS middleware
	corsOrigin := getEnv("CORS_ORIGIN", "http://localhost:8080")
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", corsOrigin)
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Routes
	api := r.Group("/api")
	{
		// Transactions
		transactions := api.Group("/transactions")
		{
			transactions.GET("/health", transactionHandler.Health)
			transactions.GET("", transactionHandler.GetAll)
			transactions.POST("", transactionHandler.Create)
			transactions.GET("/:id", transactionHandler.GetByID)
			transactions.PUT("/:id", transactionHandler.Update)
			transactions.DELETE("/:id", transactionHandler.Delete)
			transactions.POST("/upload-preview", transactionHandler.UploadPreview)
			transactions.POST("/submit", transactionHandler.SubmitTransactions)
			transactions.GET("/aggregated", transactionHandler.GetDashboardData)
		}

		// Category Rules
		categoryRules := api.Group("/categoryrules")
		{
			categoryRules.GET("", categoryRuleHandler.GetAll)
			categoryRules.POST("", categoryRuleHandler.Create)
			categoryRules.GET("/:id", categoryRuleHandler.GetByID)
			categoryRules.PUT("/:id", categoryRuleHandler.Update)
			categoryRules.DELETE("/:id", categoryRuleHandler.Delete)
		}
	}

	// Root endpoint
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Personal Finance API (Go)",
			"version": "1.0.0",
			"endpoints": gin.H{
				"transactions": "/api/transactions",
				"categoryRules": "/api/categoryrules",
			},
		})
	})

	// Start server
	port := getEnv("PORT", "7208")

	log.Printf("🚀 Personal Finance API (Go) starting on port %s", port)
	log.Printf("📍 Server: http://localhost:%s", port)
	log.Printf("🔗 Health: http://localhost:%s/api/transactions/health", port)

	r.Run(":" + port)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}