package main

import (
	"time"

	"gorm.io/gorm"
)

// Transaction represents a financial transaction
type Transaction struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	Date         time.Time `json:"date"`
	Description  string    `json:"description"`
	Remarks      string    `json:"remarks"`
	Flow         string    `json:"flow"`        // "DB" = Debit, "CR" = Credit
	Type         string    `json:"type"`        // "Expense" or "Income"
	Category     string    `json:"category"`
	Wallet       string    `json:"wallet"`      // e.g., "BCA", "SeaBank"
	AmountIDR    float64   `json:"amountIdr"`
	Currency     string    `json:"currency"`
	ExchangeRate *float64  `json:"exchangeRate,omitempty"`
	Balance      float64   `json:"balance" gorm:"-"` // Calculated field, not stored in DB
	CreatedAt    time.Time `json:"-"`
	UpdatedAt    time.Time `json:"-"`
}

// CategoryRule represents a rule for automatic categorization
type CategoryRule struct {
	ID          uint   `json:"id" gorm:"primaryKey"`
	Keyword     string `json:"keyword"`
	Type        string `json:"type"`
	Category    string `json:"category"`
	KeywordLength int  `json:"keywordLength" gorm:"-"`
}

// BeforeCreate hook to set KeywordLength
func (cr *CategoryRule) BeforeCreate(tx *gorm.DB) error {
	cr.KeywordLength = len(cr.Keyword)
	return nil
}

// BeforeUpdate hook to set KeywordLength
func (cr *CategoryRule) BeforeUpdate(tx *gorm.DB) error {
	cr.KeywordLength = len(cr.Keyword)
	return nil
}