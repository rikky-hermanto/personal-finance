package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// TransactionHandler handles transaction-related HTTP requests
type TransactionHandler struct {
	db *gorm.DB
}

// NewTransactionHandler creates a new transaction handler
func NewTransactionHandler(db *gorm.DB) *TransactionHandler {
	return &TransactionHandler{db: db}
}

// Health returns a health check response
func (h *TransactionHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "Healthy",
	})
}

// GetAll returns all transactions
func (h *TransactionHandler) GetAll(c *gin.Context) {
	var transactions []Transaction
	if err := h.db.Find(&transactions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, transactions)
}

// GetByID returns a transaction by ID
func (h *TransactionHandler) GetByID(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var transaction Transaction
	if err := h.db.First(&transaction, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Transaction not found"})
		return
	}

	c.JSON(http.StatusOK, transaction)
}

// Create creates a new transaction
func (h *TransactionHandler) Create(c *gin.Context) {
	var transaction Transaction
	if err := c.ShouldBindJSON(&transaction); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.db.Create(&transaction).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, transaction)
}

// Update updates an existing transaction
func (h *TransactionHandler) Update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var transaction Transaction
	if err := h.db.First(&transaction, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Transaction not found"})
		return
	}

	if err := c.ShouldBindJSON(&transaction); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	transaction.ID = uint(id)
	if err := h.db.Save(&transaction).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, transaction)
}

// Delete deletes a transaction
func (h *TransactionHandler) Delete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.db.Delete(&Transaction{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Transaction deleted"})
}

// UploadPreview handles file upload for preview (stub implementation)
func (h *TransactionHandler) UploadPreview(c *gin.Context) {
	// For now, return empty array - file parsing not implemented yet
	c.JSON(http.StatusOK, []Transaction{})
}

// SubmitTransactions handles bulk transaction submission (stub implementation)
func (h *TransactionHandler) SubmitTransactions(c *gin.Context) {
	var transactions []Transaction
	if err := c.ShouldBindJSON(&transactions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// For now, just return success message
	c.JSON(http.StatusOK, gin.H{
		"message": "Transactions submitted successfully",
		"count": len(transactions),
	})
}

// GetDashboardData returns aggregated dashboard data (stub implementation)
func (h *TransactionHandler) GetDashboardData(c *gin.Context) {
	// Return basic dashboard structure with zeros
	dashboard := gin.H{
		"summary": gin.H{
			"totalIncome": 0,
			"totalExpenses": 0,
			"netWorth": 0,
			"transactionCount": 0,
		},
		"currentMonth": gin.H{
			"month": "December 2025",
			"income": 0,
			"expenses": 0,
			"net": 0,
			"incomeChangePercent": 0,
			"expenseChangePercent": 0,
			"netChangePercent": 0,
		},
		"topCategories": []gin.H{},
		"cashFlow": []gin.H{},
		"lastUpdated": "2025-12-14T00:00:00Z",
	}
	c.JSON(http.StatusOK, dashboard)
}