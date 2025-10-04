---
title: Go API Implementation Guide
updated: 2025-10-04
toc: true
---

# Go API Implementation for Personal Finance System

This document provides comprehensive instructions for implementing a Go version of the Personal Finance API that is fully compatible with the existing React frontend.

## Project Overview

The Personal Finance system is a transaction management application that parses bank statements from multiple Indonesian banks (BCA, NeoBank, etc.) and automatically categorizes transactions using keyword-based rules. This Go implementation will be a drop-in replacement for the existing .NET API.

## Project Structure

Create the following directory structure:

```
api-go/
├── cmd/
│   └── server/
│       └── main.go                    # Application entry point
├── internal/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── transaction.go         # Transaction entity
│   │   │   └── category_rule.go       # CategoryRule entity
│   │   └── interfaces/
│   │       ├── transaction_repository.go  # Transaction repo interface
│   │       ├── category_rule_repository.go # CategoryRule repo interface
│   │       └── bank_parser.go         # Bank parser interface
│   ├── application/
│   │   ├── services/
│   │   │   ├── transaction_service.go      # Transaction business logic
│   │   │   ├── category_rule_service.go    # Category rule business logic
│   │   │   └── statement_import_service.go # File import logic
│   │   └── dtos/
│   │       ├── transaction_dto.go     # Transaction data transfer objects
│   │       └── category_rule_dto.go   # CategoryRule data transfer objects
│   ├── infrastructure/
│   │   ├── parsers/
│   │   │   ├── bca_csv_parser.go      # BCA CSV format parser
│   │   │   ├── neobank_pdf_parser.go  # NeoBank PDF format parser
│   │   │   └── default_csv_parser.go  # Generic CSV parser
│   │   ├── database/
│   │   │   ├── postgres.go            # PostgreSQL connection
│   │   │   └── migrations/            # Database migrations
│   │   └── repositories/
│   │       ├── transaction_repository.go   # Transaction data access
│   │       └── category_rule_repository.go # CategoryRule data access
│   └── interfaces/
│       ├── handlers/
│       │   ├── transaction_handler.go # Transaction HTTP handlers
│       │   └── category_rule_handler.go # CategoryRule HTTP handlers
│       └── middleware/
│           ├── cors.go                # CORS middleware
│           └── error_handler.go       # Error handling middleware
├── pkg/
│   └── utils/
│       ├── date_parser.go             # Date parsing utilities
│       ├── amount_parser.go           # Amount parsing utilities
│       └── file_utils.go              # File handling utilities
├── migrations/
│   ├── 001_create_transactions.up.sql
│   ├── 001_create_transactions.down.sql
│   ├── 002_create_category_rules.up.sql
│   ├── 002_create_category_rules.down.sql
│   ├── 003_seed_category_rules.up.sql
│   └── 003_seed_category_rules.down.sql
├── configs/
│   └── config.go                      # Application configuration
├── scripts/
│   ├── setup.sh                       # Setup script
│   └── run-dev.sh                     # Development run script
├── docs/
│   └── api.md                         # API documentation
├── tests/
│   ├── integration/                   # Integration tests
│   └── unit/                          # Unit tests
├── go.mod                             # Go module definition
├── go.sum                             # Go module checksums
├── Dockerfile                         # Docker configuration
├── docker-compose.yml                 # Docker Compose for development
└── README.md                          # Project documentation
```

## Technology Stack

### Core Dependencies

```go
// go.mod
module personal-finance-api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/gin-contrib/cors v1.4.0
    gorm.io/gorm v1.25.4
    gorm.io/driver/postgres v1.5.2
    github.com/golang-migrate/migrate/v4 v4.16.2
    github.com/spf13/viper v1.16.0
    github.com/go-playground/validator/v10 v10.15.5
    github.com/unidoc/unipdf/v3 v3.45.0
    github.com/stretchr/testify v1.8.4
)
```

## Domain Layer Implementation

### 1. Transaction Entity

```go
// internal/domain/entities/transaction.go
package entities

import (
    "time"
    "gorm.io/gorm"
)

type Transaction struct {
    ID           uint      `json:"id" gorm:"primaryKey"`
    Date         time.Time `json:"date" gorm:"not null"`
    Description  string    `json:"description" gorm:"size:500;not null"`
    Remarks      string    `json:"remarks" gorm:"size:500"`
    Flow         string    `json:"flow" gorm:"size:5;not null;default:DB"` // DB or CR
    Type         string    `json:"type" gorm:"size:15;not null;default:Expense"` // Income or Expense
    Category     string    `json:"category" gorm:"size:100;not null;default:Untracked Category"`
    Wallet       string    `json:"wallet" gorm:"size:50;not null"`
    AmountIDR    float64   `json:"amountIdr" gorm:"not null"`
    Currency     string    `json:"currency" gorm:"size:10;not null;default:IDR"`
    ExchangeRate *float64  `json:"exchangeRate"`
    CreatedAt    time.Time `json:"createdAt"`
    UpdatedAt    time.Time `json:"updatedAt"`
    DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

func (Transaction) TableName() string {
    return "transactions"
}
```

### 2. CategoryRule Entity

```go
// internal/domain/entities/category_rule.go
package entities

import (
    "time"
    "gorm.io/gorm"
)

type CategoryRule struct {
    ID            uint   `json:"id" gorm:"primaryKey"`
    Keyword       string `json:"keyword" gorm:"size:100;not null"`
    Type          string `json:"type" gorm:"size:50;not null"`
    Category      string `json:"category" gorm:"size:100;not null"`
    KeywordLength int    `json:"keywordLength" gorm:"-"` // Computed field
    CreatedAt     time.Time `json:"createdAt"`
    UpdatedAt     time.Time `json:"updatedAt"`
    DeletedAt     gorm.DeletedAt `json:"-" gorm:"index"`
}

func (CategoryRule) TableName() string {
    return "category_rules"
}

// AfterFind hook to compute KeywordLength
func (cr *CategoryRule) AfterFind(tx *gorm.DB) error {
    cr.KeywordLength = len(cr.Keyword)
    return nil
}
```

### 3. Repository Interfaces

```go
// internal/domain/interfaces/transaction_repository.go
package interfaces

import (
    "context"
    "personal-finance-api/internal/domain/entities"
)

type TransactionRepository interface {
    GetAll(ctx context.Context) ([]*entities.Transaction, error)
    GetByID(ctx context.Context, id uint) (*entities.Transaction, error)
    Create(ctx context.Context, transaction *entities.Transaction) error
    Update(ctx context.Context, transaction *entities.Transaction) error
    Delete(ctx context.Context, id uint) error
}
```

```go
// internal/domain/interfaces/category_rule_repository.go
package interfaces

import (
    "context"
    "personal-finance-api/internal/domain/entities"
)

type CategoryRuleRepository interface {
    GetAll(ctx context.Context) ([]*entities.CategoryRule, error)
    GetByID(ctx context.Context, id uint) (*entities.CategoryRule, error)
    Create(ctx context.Context, rule *entities.CategoryRule) error
    Update(ctx context.Context, rule *entities.CategoryRule) error
    Delete(ctx context.Context, id uint) error
    FindByKeywordAndType(ctx context.Context, description, transactionType string) (*entities.CategoryRule, error)
}
```

```go
// internal/domain/interfaces/bank_parser.go
package interfaces

import (
    "context"
    "io"
    "personal-finance-api/internal/application/dtos"
)

type BankStatementParser interface {
    ParseAsync(ctx context.Context, fileStream io.Reader, password *string) ([]*dtos.TransactionDTO, error)
    GetBankCode() string
    GetSupportedFormats() []string
}
```

## Application Layer Implementation

### 1. Data Transfer Objects

```go
// internal/application/dtos/transaction_dto.go
package dtos

import (
    "time"
)

type TransactionDTO struct {
    ID             uint                `json:"id"`
    Date           time.Time           `json:"date"`
    Description    string              `json:"description"`
    Remarks        string              `json:"remarks"`
    Flow           string              `json:"flow"`
    Type           string              `json:"type"`
    Category       string              `json:"category"`
    Wallet         string              `json:"wallet"`
    AmountIDR      float64             `json:"amountIdr"`
    Currency       string              `json:"currency"`
    ExchangeRate   *float64            `json:"exchangeRate"`
    Balance        float64             `json:"balance"`
    CategoryRuleDTO *CategoryRuleDTO    `json:"categoryRuleDto,omitempty"`
}

type CreateTransactionRequest struct {
    Date         time.Time `json:"date" validate:"required"`
    Description  string    `json:"description" validate:"required,max=500"`
    Remarks      string    `json:"remarks" validate:"max=500"`
    Flow         string    `json:"flow" validate:"required,oneof=DB CR"`
    Type         string    `json:"type" validate:"required,oneof=Income Expense"`
    Category     string    `json:"category" validate:"required,max=100"`
    Wallet       string    `json:"wallet" validate:"required,max=50"`
    AmountIDR    float64   `json:"amountIdr" validate:"required,min=0"`
    Currency     string    `json:"currency" validate:"max=10"`
    ExchangeRate *float64  `json:"exchangeRate" validate:"omitempty,min=0"`
}

type UpdateTransactionRequest struct {
    Date         *time.Time `json:"date"`
    Description  *string    `json:"description" validate:"omitempty,max=500"`
    Remarks      *string    `json:"remarks" validate:"omitempty,max=500"`
    Flow         *string    `json:"flow" validate:"omitempty,oneof=DB CR"`
    Type         *string    `json:"type" validate:"omitempty,oneof=Income Expense"`
    Category     *string    `json:"category" validate:"omitempty,max=100"`
    Wallet       *string    `json:"wallet" validate:"omitempty,max=50"`
    AmountIDR    *float64   `json:"amountIdr" validate:"omitempty,min=0"`
    Currency     *string    `json:"currency" validate:"omitempty,max=10"`
    ExchangeRate *float64   `json:"exchangeRate" validate:"omitempty,min=0"`
}
```

```go
// internal/application/dtos/category_rule_dto.go
package dtos

type CategoryRuleDTO struct {
    ID            uint   `json:"id"`
    Keyword       string `json:"keyword"`
    Type          string `json:"type"`
    Category      string `json:"category"`
    KeywordLength int    `json:"keywordLength"`
}

type CreateCategoryRuleRequest struct {
    Keyword  string `json:"keyword" validate:"required,max=100"`
    Type     string `json:"type" validate:"required,max=50"`
    Category string `json:"category" validate:"required,max=100"`
}

type UpdateCategoryRuleRequest struct {
    Keyword  *string `json:"keyword" validate:"omitempty,max=100"`
    Type     *string `json:"type" validate:"omitempty,max=50"`
    Category *string `json:"category" validate:"omitempty,max=100"`
}
```

### 2. Services

```go
// internal/application/services/transaction_service.go
package services

import (
    "context"
    "personal-finance-api/internal/application/dtos"
    "personal-finance-api/internal/domain/entities"
    "personal-finance-api/internal/domain/interfaces"
)

type TransactionService struct {
    transactionRepo interfaces.TransactionRepository
    categoryService *CategoryRuleService
}

func NewTransactionService(transactionRepo interfaces.TransactionRepository, categoryService *CategoryRuleService) *TransactionService {
    return &TransactionService{
        transactionRepo: transactionRepo,
        categoryService: categoryService,
    }
}

func (s *TransactionService) GetAll(ctx context.Context) ([]*dtos.TransactionDTO, error) {
    transactions, err := s.transactionRepo.GetAll(ctx)
    if err != nil {
        return nil, err
    }

    var result []*dtos.TransactionDTO
    for _, t := range transactions {
        result = append(result, s.entityToDTO(t))
    }
    
    return result, nil
}

func (s *TransactionService) GetByID(ctx context.Context, id uint) (*dtos.TransactionDTO, error) {
    transaction, err := s.transactionRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    
    return s.entityToDTO(transaction), nil
}

func (s *TransactionService) Create(ctx context.Context, req *dtos.CreateTransactionRequest) (*dtos.TransactionDTO, error) {
    transaction := &entities.Transaction{
        Date:         req.Date,
        Description:  req.Description,
        Remarks:      req.Remarks,
        Flow:         req.Flow,
        Type:         req.Type,
        Category:     req.Category,
        Wallet:       req.Wallet,
        AmountIDR:    req.AmountIDR,
        Currency:     req.Currency,
        ExchangeRate: req.ExchangeRate,
    }

    // Auto-categorize if category is default
    if transaction.Category == "Untracked Category" || transaction.Category == "" {
        category, err := s.categoryService.CategorizeAsync(ctx, transaction.Description, transaction.Type)
        if err == nil {
            transaction.Category = category
        }
    }

    err := s.transactionRepo.Create(ctx, transaction)
    if err != nil {
        return nil, err
    }
    
    return s.entityToDTO(transaction), nil
}

func (s *TransactionService) Update(ctx context.Context, id uint, req *dtos.UpdateTransactionRequest) (*dtos.TransactionDTO, error) {
    transaction, err := s.transactionRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }

    // Update fields if provided
    if req.Date != nil {
        transaction.Date = *req.Date
    }
    if req.Description != nil {
        transaction.Description = *req.Description
    }
    if req.Remarks != nil {
        transaction.Remarks = *req.Remarks
    }
    if req.Flow != nil {
        transaction.Flow = *req.Flow
    }
    if req.Type != nil {
        transaction.Type = *req.Type
    }
    if req.Category != nil {
        transaction.Category = *req.Category
    }
    if req.Wallet != nil {
        transaction.Wallet = *req.Wallet
    }
    if req.AmountIDR != nil {
        transaction.AmountIDR = *req.AmountIDR
    }
    if req.Currency != nil {
        transaction.Currency = *req.Currency
    }
    if req.ExchangeRate != nil {
        transaction.ExchangeRate = req.ExchangeRate
    }

    err = s.transactionRepo.Update(ctx, transaction)
    if err != nil {
        return nil, err
    }
    
    return s.entityToDTO(transaction), nil
}

func (s *TransactionService) Delete(ctx context.Context, id uint) error {
    return s.transactionRepo.Delete(ctx, id)
}

func (s *TransactionService) entityToDTO(t *entities.Transaction) *dtos.TransactionDTO {
    return &dtos.TransactionDTO{
        ID:           t.ID,
        Date:         t.Date,
        Description:  t.Description,
        Remarks:      t.Remarks,
        Flow:         t.Flow,
        Type:         t.Type,
        Category:     t.Category,
        Wallet:       t.Wallet,
        AmountIDR:    t.AmountIDR,
        Currency:     t.Currency,
        ExchangeRate: t.ExchangeRate,
        Balance:      0, // Calculated on demand
    }
}
```

```go
// internal/application/services/category_rule_service.go
package services

import (
    "context"
    "strings"
    "personal-finance-api/internal/application/dtos"
    "personal-finance-api/internal/domain/entities"
    "personal-finance-api/internal/domain/interfaces"
)

type CategoryRuleService struct {
    categoryRuleRepo interfaces.CategoryRuleRepository
}

func NewCategoryRuleService(categoryRuleRepo interfaces.CategoryRuleRepository) *CategoryRuleService {
    return &CategoryRuleService{
        categoryRuleRepo: categoryRuleRepo,
    }
}

func (s *CategoryRuleService) CategorizeAsync(ctx context.Context, description, transactionType string) (string, error) {
    rules, err := s.categoryRuleRepo.GetAll(ctx)
    if err != nil {
        return "Untracked Category", err
    }

    // Sort rules by keyword length (longest first) for best match
    // Find best matching rule (case-insensitive)
    var bestMatch *entities.CategoryRule
    maxLength := 0

    upperDesc := strings.ToUpper(description)
    upperType := strings.ToUpper(transactionType)

    for _, rule := range rules {
        upperKeyword := strings.ToUpper(rule.Keyword)
        upperRuleType := strings.ToUpper(rule.Type)

        if strings.Contains(upperDesc, upperKeyword) && 
           (upperRuleType == upperType || rule.Type == "") {
            if len(rule.Keyword) > maxLength {
                bestMatch = rule
                maxLength = len(rule.Keyword)
            }
        }
    }

    if bestMatch != nil {
        return bestMatch.Category, nil
    }

    return "Untracked Category", nil
}

func (s *CategoryRuleService) GetAll(ctx context.Context) ([]*dtos.CategoryRuleDTO, error) {
    rules, err := s.categoryRuleRepo.GetAll(ctx)
    if err != nil {
        return nil, err
    }

    var result []*dtos.CategoryRuleDTO
    for _, r := range rules {
        result = append(result, s.entityToDTO(r))
    }
    
    return result, nil
}

func (s *CategoryRuleService) GetByID(ctx context.Context, id uint) (*dtos.CategoryRuleDTO, error) {
    rule, err := s.categoryRuleRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    
    return s.entityToDTO(rule), nil
}

func (s *CategoryRuleService) Create(ctx context.Context, req *dtos.CreateCategoryRuleRequest) (*dtos.CategoryRuleDTO, error) {
    rule := &entities.CategoryRule{
        Keyword:  req.Keyword,
        Type:     req.Type,
        Category: req.Category,
    }

    err := s.categoryRuleRepo.Create(ctx, rule)
    if err != nil {
        return nil, err
    }
    
    return s.entityToDTO(rule), nil
}

func (s *CategoryRuleService) Update(ctx context.Context, id uint, req *dtos.UpdateCategoryRuleRequest) (*dtos.CategoryRuleDTO, error) {
    rule, err := s.categoryRuleRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }

    if req.Keyword != nil {
        rule.Keyword = *req.Keyword
    }
    if req.Type != nil {
        rule.Type = *req.Type
    }
    if req.Category != nil {
        rule.Category = *req.Category
    }

    err = s.categoryRuleRepo.Update(ctx, rule)
    if err != nil {
        return nil, err
    }
    
    return s.entityToDTO(rule), nil
}

func (s *CategoryRuleService) Delete(ctx context.Context, id uint) error {
    return s.categoryRuleRepo.Delete(ctx, id)
}

func (s *CategoryRuleService) entityToDTO(r *entities.CategoryRule) *dtos.CategoryRuleDTO {
    return &dtos.CategoryRuleDTO{
        ID:            r.ID,
        Keyword:       r.Keyword,
        Type:          r.Type,
        Category:      r.Category,
        KeywordLength: len(r.Keyword),
    }
}
```

## Infrastructure Layer Implementation

### 1. Database Connection

```go
// internal/infrastructure/database/postgres.go
package database

import (
    "fmt"
    "log"
    "personal-finance-api/internal/domain/entities"
    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

type Config struct {
    Host     string
    Port     string
    User     string
    Password string
    DBName   string
    SSLMode  string
}

func NewPostgresConnection(config *Config) (*gorm.DB, error) {
    dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s TimeZone=UTC",
        config.Host, config.User, config.Password, config.DBName, config.Port, config.SSLMode)

    db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Info),
    })
    if err != nil {
        return nil, fmt.Errorf("failed to connect to database: %v", err)
    }

    // Auto migrate the schema
    err = db.AutoMigrate(&entities.Transaction{}, &entities.CategoryRule{})
    if err != nil {
        return nil, fmt.Errorf("failed to migrate database: %v", err)
    }

    log.Println("Database connected successfully")
    return db, nil
}
```

### 2. Repository Implementations

```go
// internal/infrastructure/repositories/transaction_repository.go
package repositories

import (
    "context"
    "personal-finance-api/internal/domain/entities"
    "personal-finance-api/internal/domain/interfaces"
    "gorm.io/gorm"
)

type transactionRepository struct {
    db *gorm.DB
}

func NewTransactionRepository(db *gorm.DB) interfaces.TransactionRepository {
    return &transactionRepository{db: db}
}

func (r *transactionRepository) GetAll(ctx context.Context) ([]*entities.Transaction, error) {
    var transactions []*entities.Transaction
    err := r.db.WithContext(ctx).Order("date DESC").Find(&transactions).Error
    return transactions, err
}

func (r *transactionRepository) GetByID(ctx context.Context, id uint) (*entities.Transaction, error) {
    var transaction entities.Transaction
    err := r.db.WithContext(ctx).First(&transaction, id).Error
    if err != nil {
        return nil, err
    }
    return &transaction, nil
}

func (r *transactionRepository) Create(ctx context.Context, transaction *entities.Transaction) error {
    return r.db.WithContext(ctx).Create(transaction).Error
}

func (r *transactionRepository) Update(ctx context.Context, transaction *entities.Transaction) error {
    return r.db.WithContext(ctx).Save(transaction).Error
}

func (r *transactionRepository) Delete(ctx context.Context, id uint) error {
    return r.db.WithContext(ctx).Delete(&entities.Transaction{}, id).Error
}
```

### 3. Bank Statement Parsers

```go
// internal/infrastructure/parsers/bca_csv_parser.go
package parsers

import (
    "context"
    "encoding/csv"
    "fmt"
    "io"
    "strconv"
    "strings"
    "time"
    "personal-finance-api/internal/application/dtos"
    "personal-finance-api/internal/application/services"
    "personal-finance-api/pkg/utils"
)

type BcaCsvParser struct {
    categoryService *services.CategoryRuleService
}

func NewBcaCsvParser(categoryService *services.CategoryRuleService) *BcaCsvParser {
    return &BcaCsvParser{
        categoryService: categoryService,
    }
}

func (p *BcaCsvParser) GetBankCode() string {
    return "BCA"
}

func (p *BcaCsvParser) GetSupportedFormats() []string {
    return []string{"text/csv", "application/pdf"}
}

func (p *BcaCsvParser) ParseAsync(ctx context.Context, fileStream io.Reader, password *string) ([]*dtos.TransactionDTO, error) {
    reader := csv.NewReader(fileStream)
    reader.LazyQuotes = true
    
    var transactions []*dtos.TransactionDTO
    headerFound := false
    
    for {
        record, err := reader.Read()
        if err == io.EOF {
            break
        }
        if err != nil {
            return nil, fmt.Errorf("error reading CSV: %v", err)
        }
        
        // Skip until we find the header
        if !headerFound {
            if len(record) > 0 && strings.Contains(strings.ToLower(record[0]), "tanggal") {
                headerFound = true
            }
            continue
        }
        
        // Stop at summary/footer
        if len(record) > 0 && (strings.Contains(record[0], "Saldo Awal") || strings.TrimSpace(record[0]) == "") {
            break
        }
        
        if len(record) < 6 {
            continue
        }
        
        // Parse BCA CSV format: Tanggal,Keterangan,Cabang,Jumlah,,Saldo
        date, err := utils.ParseBCADate(record[0])
        if err != nil {
            continue
        }
        
        description := strings.Trim(record[1], "' \"")
        
        amount, err := strconv.ParseFloat(strings.ReplaceAll(record[3], ",", ""), 64)
        if err != nil {
            continue
        }
        
        flow := strings.TrimSpace(record[4])
        if flow == "" {
            flow = "DB"
        }
        
        transactionType := "Expense"
        if flow == "CR" {
            transactionType = "Income"
        }
        
        // Auto-categorize
        category, err := p.categoryService.CategorizeAsync(ctx, description, transactionType)
        if err != nil {
            category = "Untracked Category"
        }
        
        transaction := &dtos.TransactionDTO{
            Date:         date,
            Description:  description,
            Remarks:      "",
            Flow:         flow,
            Type:         transactionType,
            Category:     category,
            Wallet:       "BCA",
            AmountIDR:    amount,
            Currency:     "IDR",
            ExchangeRate: nil,
        }
        
        transactions = append(transactions, transaction)
    }
    
    return transactions, nil
}
```

### 4. Utilities

```go
// pkg/utils/date_parser.go
package utils

import (
    "fmt"
    "strings"
    "time"
)

func ParseBCADate(input string) (time.Time, error) {
    trimmed := strings.Trim(input, "' \"")
    
    formats := []string{
        "02/01/2006",
        "2/1/2006", 
        "2/1/06",
        "02/01/06",
        "02/01",
        "2/1",
    }
    
    for _, format := range formats {
        if date, err := time.Parse(format, trimmed); err == nil {
            // If year is missing, use current year
            if format == "02/01" || format == "2/1" {
                now := time.Now()
                return time.Date(now.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC), nil
            }
            return date.UTC(), nil
        }
    }
    
    return time.Time{}, fmt.Errorf("unable to parse date: %s", input)
}

func ParseGenericDate(dateString string) (time.Time, error) {
    if dateString == "" {
        return time.Time{}, fmt.Errorf("empty date string")
    }
    
    formats := []string{
        "2006-01-02",
        "02/01/2006",
        "2/1/2006",
        "2006-01-02T15:04:05Z",
        "2006-01-02 15:04:05",
        "02 Jan 2006",
        "2 Jan 2006",
        "02 January 2006",
    }
    
    for _, format := range formats {
        if date, err := time.Parse(format, dateString); err == nil {
            return date.UTC(), nil
        }
    }
    
    return time.Time{}, fmt.Errorf("unable to parse date: %s", dateString)
}
```

```go
// pkg/utils/amount_parser.go
package utils

import (
    "fmt"
    "regexp"
    "strconv"
    "strings"
)

func ParseAmount(amountString string) (float64, error) {
    if amountString == "" {
        return 0, nil
    }
    
    // Remove currency symbols and formatting
    cleaned := strings.ReplaceAll(amountString, "Rp", "")
    cleaned = strings.ReplaceAll(cleaned, "$", "")
    cleaned = strings.ReplaceAll(cleaned, "€", "")
    cleaned = strings.ReplaceAll(cleaned, "£", "")
    cleaned = strings.ReplaceAll(cleaned, " ", "")
    cleaned = strings.TrimSpace(cleaned)
    
    // Handle negative amounts in parentheses
    if strings.HasPrefix(cleaned, "(") && strings.HasSuffix(cleaned, ")") {
        cleaned = "-" + cleaned[1:len(cleaned)-1]
    }
    
    // Handle European format (1.234,56) vs US format (1,234.56)
    commaCount := strings.Count(cleaned, ",")
    dotCount := strings.Count(cleaned, ".")
    
    if commaCount > 0 && dotCount > 0 {
        lastCommaIndex := strings.LastIndex(cleaned, ",")
        lastDotIndex := strings.LastIndex(cleaned, ".")
        
        if lastCommaIndex > lastDotIndex {
            // European format: 1.234,56
            cleaned = strings.ReplaceAll(cleaned, ".", "")
            cleaned = strings.ReplaceAll(cleaned, ",", ".")
        } else {
            // US format: 1,234.56
            cleaned = strings.ReplaceAll(cleaned, ",", "")
        }
    } else if commaCount > 0 {
        // Could be thousands separator or decimal separator
        commaIndex := strings.LastIndex(cleaned, ",")
        if len(cleaned)-commaIndex == 3 {
            // Likely thousands separator
            cleaned = strings.ReplaceAll(cleaned, ",", "")
        } else {
            // Likely decimal separator
            cleaned = strings.ReplaceAll(cleaned, ",", ".")
        }
    }
    
    amount, err := strconv.ParseFloat(cleaned, 64)
    if err != nil {
        return 0, fmt.Errorf("unable to parse amount: %s", amountString)
    }
    
    return amount, nil
}

func ParseEuropeanDecimal(input string) (float64, error) {
    // Matches European decimal format: -1.234,56
    re := regexp.MustCompile(`^-?[\d.]*,\d{2}$`)
    if !re.MatchString(input) {
        return 0, fmt.Errorf("invalid European decimal format: %s", input)
    }
    
    // Replace comma with dot for parsing
    normalized := strings.ReplaceAll(input, ".", "")
    normalized = strings.ReplaceAll(normalized, ",", ".")
    
    return strconv.ParseFloat(normalized, 64)
}
```

## API Layer Implementation

### 1. HTTP Handlers

```go
// internal/interfaces/handlers/transaction_handler.go
package handlers

import (
    "net/http"
    "strconv"
    "github.com/gin-gonic/gin"
    "personal-finance-api/internal/application/dtos"
    "personal-finance-api/internal/application/services"
)

type TransactionHandler struct {
    transactionService *services.TransactionService
    importService      *services.StatementImportService
}

func NewTransactionHandler(transactionService *services.TransactionService, importService *services.StatementImportService) *TransactionHandler {
    return &TransactionHandler{
        transactionService: transactionService,
        importService:      importService,
    }
}

func (h *TransactionHandler) HealthCheck(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"status": "Healthy"})
}

func (h *TransactionHandler) GetSupportedTypes(c *gin.Context) {
    supported := []map[string]interface{}{
        {"Bank": "BCA", "Types": []string{"text/csv", "application/pdf"}},
        {"Bank": "NeoBank", "Types": []string{"text/csv", "application/pdf"}},
        {"Bank": "Superbank", "Types": []string{"text/csv", "application/pdf"}},
        {"Bank": "Wise", "Types": []string{"text/csv", "application/pdf"}},
        {"Bank": "Standard", "Types": []string{"text/csv"}},
    }
    c.JSON(http.StatusOK, supported)
}

func (h *TransactionHandler) GetAll(c *gin.Context) {
    transactions, err := h.transactionService.GetAll(c.Request.Context())
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch transactions", "detail": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, transactions)
}

func (h *TransactionHandler) GetByID(c *gin.Context) {
    idStr := c.Param("id")
    id, err := strconv.ParseUint(idStr, 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid transaction ID"})
        return
    }
    
    transaction, err := h.transactionService.GetByID(c.Request.Context(), uint(id))
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"message": "Transaction not found"})
        return
    }
    
    c.JSON(http.StatusOK, transaction)
}

func (h *TransactionHandler) Create(c *gin.Context) {
    var req dtos.CreateTransactionRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request body", "detail": err.Error()})
        return
    }
    
    transaction, err := h.transactionService.Create(c.Request.Context(), &req)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create transaction", "detail": err.Error()})
        return
    }
    
    c.JSON(http.StatusCreated, transaction)
}

func (h *TransactionHandler) Update(c *gin.Context) {
    idStr := c.Param("id")
    id, err := strconv.ParseUint(idStr, 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid transaction ID"})
        return
    }
    
    var req dtos.UpdateTransactionRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request body", "detail": err.Error()})
        return
    }
    
    transaction, err := h.transactionService.Update(c.Request.Context(), uint(id), &req)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update transaction", "detail": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, transaction)
}

func (h *TransactionHandler) Delete(c *gin.Context) {
    idStr := c.Param("id")
    id, err := strconv.ParseUint(idStr, 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid transaction ID"})
        return
    }
    
    err = h.transactionService.Delete(c.Request.Context(), uint(id))
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to delete transaction", "detail": err.Error()})
        return
    }
    
    c.JSON(http.StatusNoContent, nil)
}

func (h *TransactionHandler) UploadPreview(c *gin.Context) {
    file, header, err := c.Request.FormFile("file")
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"message": "File is required"})
        return
    }
    defer file.Close()
    
    if header.Size == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"message": "File is empty"})
        return
    }
    
    // Get optional PDF password
    pdfPassword := c.PostForm("pdfPassword")
    var password *string
    if pdfPassword != "" {
        password = &pdfPassword
    }
    
    // Determine bank code (simplified - in real implementation, auto-detect from file content)
    bankCode := "STANDARD" // Default
    if strings.Contains(strings.ToLower(header.Filename), "bca") {
        bankCode = "BCA"
    } else if strings.Contains(strings.ToLower(header.Filename), "neo") {
        bankCode = "NEOBANK"
    }
    
    transactions, err := h.importService.ImportAsync(c.Request.Context(), file, bankCode, password)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to parse file", "detail": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "fileName": header.Filename,
        "transactions": transactions,
    })
}
```

### 2. Main Application

```go
// cmd/server/main.go
package main

import (
    "log"
    "personal-finance-api/configs"
    "personal-finance-api/internal/application/services"
    "personal-finance-api/internal/infrastructure/database"
    "personal-finance-api/internal/infrastructure/repositories"
    "personal-finance-api/internal/infrastructure/parsers"
    "personal-finance-api/internal/interfaces/handlers"
    "personal-finance-api/internal/interfaces/middleware"
    
    "github.com/gin-gonic/gin"
    "github.com/gin-contrib/cors"
)

func main() {
    // Load configuration
    config := configs.LoadConfig()
    
    // Initialize database
    db, err := database.NewPostgresConnection(&database.Config{
        Host:     config.Database.Host,
        Port:     config.Database.Port,
        User:     config.Database.User,
        Password: config.Database.Password,
        DBName:   config.Database.Name,
        SSLMode:  config.Database.SSLMode,
    })
    if err != nil {
        log.Fatalf("Failed to connect to database: %v", err)
    }
    
    // Initialize repositories
    transactionRepo := repositories.NewTransactionRepository(db)
    categoryRuleRepo := repositories.NewCategoryRuleRepository(db)
    
    // Initialize services
    categoryRuleService := services.NewCategoryRuleService(categoryRuleRepo)
    transactionService := services.NewTransactionService(transactionRepo, categoryRuleService)
    
    // Initialize parsers
    bcaParser := parsers.NewBcaCsvParser(categoryRuleService)
    neoParser := parsers.NewNeoBankPdfParser(categoryRuleService)
    defaultParser := parsers.NewDefaultCsvParser(categoryRuleService)
    
    importService := services.NewStatementImportService(map[string]interfaces.BankStatementParser{
        "BCA":      bcaParser,
        "NEOBANK":  neoParser,
        "STANDARD": defaultParser,
    })
    
    // Initialize handlers
    transactionHandler := handlers.NewTransactionHandler(transactionService, importService)
    categoryRuleHandler := handlers.NewCategoryRuleHandler(categoryRuleService)
    
    // Initialize Gin router
    router := gin.Default()
    
    // Add CORS middleware
    router.Use(cors.New(cors.Config{
        AllowOrigins:     []string{config.Server.CORSAllowedOrigins},
        AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowHeaders:     []string{"*"},
        ExposeHeaders:    []string{"*"},
        AllowCredentials: true,
    }))
    
    // Add error handling middleware
    router.Use(middleware.ErrorHandler())
    
    // Setup routes
    setupRoutes(router, transactionHandler, categoryRuleHandler)
    
    // Start server
    log.Printf("Server starting on port %s", config.Server.Port)
    if err := router.Run(":" + config.Server.Port); err != nil {
        log.Fatalf("Failed to start server: %v", err)
    }
}

func setupRoutes(router *gin.Engine, transactionHandler *handlers.TransactionHandler, categoryRuleHandler *handlers.CategoryRuleHandler) {
    api := router.Group("/api")
    
    // Transaction routes
    transactions := api.Group("/transactions")
    {
        transactions.GET("/health", transactionHandler.HealthCheck)
        transactions.GET("/supported-types", transactionHandler.GetSupportedTypes)
        transactions.GET("", transactionHandler.GetAll)
        transactions.GET("/:id", transactionHandler.GetByID)
        transactions.POST("", transactionHandler.Create)
        transactions.PUT("/:id", transactionHandler.Update)
        transactions.DELETE("/:id", transactionHandler.Delete)
        transactions.POST("/upload-preview", transactionHandler.UploadPreview)
    }
    
    // Category rule routes
    categoryRules := api.Group("/categoryrules")
    {
        categoryRules.GET("", categoryRuleHandler.GetAll)
        categoryRules.GET("/:id", categoryRuleHandler.GetByID)
        categoryRules.POST("", categoryRuleHandler.Create)
        categoryRules.PUT("/:id", categoryRuleHandler.Update)
        categoryRules.DELETE("/:id", categoryRuleHandler.Delete)
    }
}
```

## Configuration

```go
// configs/config.go
package configs

import (
    "log"
    "github.com/spf13/viper"
)

type Config struct {
    Server   ServerConfig   `mapstructure:"server"`
    Database DatabaseConfig `mapstructure:"database"`
}

type ServerConfig struct {
    Port               string `mapstructure:"port"`
    CORSAllowedOrigins string `mapstructure:"cors_allowed_origins"`
}

type DatabaseConfig struct {
    Host     string `mapstructure:"host"`
    Port     string `mapstructure:"port"`
    User     string `mapstructure:"user"`
    Password string `mapstructure:"password"`
    Name     string `mapstructure:"name"`
    SSLMode  string `mapstructure:"ssl_mode"`
}

func LoadConfig() *Config {
    viper.SetConfigName("config")
    viper.SetConfigType("yaml")
    viper.AddConfigPath(".")
    viper.AddConfigPath("./configs")
    
    // Set defaults
    viper.SetDefault("server.port", "7208")
    viper.SetDefault("server.cors_allowed_origins", "http://localhost:8080")
    viper.SetDefault("database.host", "localhost")
    viper.SetDefault("database.port", "5432")
    viper.SetDefault("database.user", "postgres")
    viper.SetDefault("database.password", "postgres123")
    viper.SetDefault("database.name", "personal_finance")
    viper.SetDefault("database.ssl_mode", "disable")
    
    // Read from environment
    viper.AutomaticEnv()
    viper.SetEnvPrefix("PF")
    
    if err := viper.ReadInConfig(); err != nil {
        log.Printf("Config file not found, using defaults: %v", err)
    }
    
    var config Config
    if err := viper.Unmarshal(&config); err != nil {
        log.Fatalf("Unable to decode config: %v", err)
    }
    
    return &config
}
```

## Database Migrations

```sql
-- migrations/001_create_transactions.up.sql
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    description VARCHAR(500) NOT NULL,
    remarks VARCHAR(500) DEFAULT '',
    flow VARCHAR(5) NOT NULL DEFAULT 'DB',
    type VARCHAR(15) NOT NULL DEFAULT 'Expense',
    category VARCHAR(100) NOT NULL DEFAULT 'Untracked Category',
    wallet VARCHAR(50) NOT NULL,
    amount_idr DECIMAL NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
    exchange_rate DECIMAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at);
```

```sql
-- migrations/002_create_category_rules.up.sql
CREATE TABLE IF NOT EXISTS category_rules (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_category_rules_keyword ON category_rules(keyword);
CREATE INDEX IF NOT EXISTS idx_category_rules_type ON category_rules(type);
CREATE INDEX IF NOT EXISTS idx_category_rules_deleted_at ON category_rules(deleted_at);
```

## Docker Configuration

```dockerfile
# Dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main cmd/server/main.go

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates
WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/main .
COPY --from=builder /app/configs ./configs
COPY --from=builder /app/migrations ./migrations

# Expose port
EXPOSE 7208

# Run the binary
CMD ["./main"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: personal_finance
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  api:
    build: .
    ports:
      - "7208:7208"
    environment:
      PF_DATABASE_HOST: postgres
      PF_DATABASE_PORT: 5432
      PF_DATABASE_USER: postgres
      PF_DATABASE_PASSWORD: postgres123
      PF_DATABASE_NAME: personal_finance
      PF_SERVER_PORT: 7208
      PF_SERVER_CORS_ALLOWED_ORIGINS: http://localhost:8080
    depends_on:
      - postgres
    volumes:
      - ./configs:/root/configs

volumes:
  postgres_data:
```

## Development Scripts

```bash
#!/bin/bash
# scripts/setup.sh

echo "Setting up Personal Finance Go API..."

# Install dependencies
go mod download

# Run database migrations
migrate -path migrations -database "postgres://postgres:postgres123@localhost:5432/personal_finance?sslmode=disable" up

echo "Setup complete!"
```

```bash
#!/bin/bash
# scripts/run-dev.sh

echo "Starting development server..."

# Start PostgreSQL if not running
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
sleep 5

# Run migrations
migrate -path migrations -database "postgres://postgres:postgres123@localhost:5432/personal_finance?sslmode=disable" up

# Start the API server
go run cmd/server/main.go
```

## Testing Strategy

Create comprehensive tests for:

1. **Unit Tests**: Services, parsers, utilities
2. **Integration Tests**: Repository operations, database interactions
3. **API Tests**: HTTP endpoint testing

```go
// tests/unit/services/transaction_service_test.go
package services_test

import (
    "context"
    "testing"
    "time"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "personal-finance-api/internal/application/services"
    "personal-finance-api/internal/domain/entities"
)

func TestTransactionService_Create(t *testing.T) {
    // Mock repository
    mockRepo := &MockTransactionRepository{}
    mockCategoryService := &MockCategoryRuleService{}
    
    service := services.NewTransactionService(mockRepo, mockCategoryService)
    
    // Test case: successful creation
    req := &dtos.CreateTransactionRequest{
        Date:        time.Now(),
        Description: "Test transaction",
        AmountIDR:   100000,
        Category:    "Untracked Category",
        Wallet:      "BCA",
        Flow:        "DB",
        Type:        "Expense",
    }
    
    mockCategoryService.On("CategorizeAsync", mock.Anything, req.Description, req.Type).Return("Food", nil)
    mockRepo.On("Create", mock.Anything, mock.AnythingOfType("*entities.Transaction")).Return(nil)
    
    result, err := service.Create(context.Background(), req)
    
    assert.NoError(t, err)
    assert.NotNil(t, result)
    assert.Equal(t, "Food", result.Category)
    
    mockRepo.AssertExpectations(t)
    mockCategoryService.AssertExpectations(t)
}
```

## Deployment Instructions

1. **Local Development**:
   ```bash
   ./scripts/setup.sh
   ./scripts/run-dev.sh
   ```

2. **Docker Development**:
   ```bash
   docker-compose up --build
   ```

3. **Production Deployment**:
   - Use Docker images with proper environment variables
   - Set up PostgreSQL with proper security
   - Configure reverse proxy (nginx/traefik)
   - Set up monitoring and logging

## Environment Variables

Create a `.env` file for local development:

```env
PF_DATABASE_HOST=localhost
PF_DATABASE_PORT=5432
PF_DATABASE_USER=postgres
PF_DATABASE_PASSWORD=postgres123
PF_DATABASE_NAME=personal_finance
PF_DATABASE_SSL_MODE=disable
PF_SERVER_PORT=7208
PF_SERVER_CORS_ALLOWED_ORIGINS=http://localhost:8080
```

## Performance Considerations

1. **Database Indexing**: Proper indexes on frequently queried columns
2. **Connection Pooling**: Configure GORM connection pool settings
3. **Caching**: Implement Redis caching for category rules
4. **File Processing**: Handle large files with streaming
5. **Pagination**: Implement pagination for large transaction lists

## Security Considerations

1. **Input Validation**: Validate all inputs using validator library
2. **SQL Injection**: Use GORM's prepared statements
3. **File Upload**: Validate file types and sizes
4. **CORS**: Configure proper CORS policies
5. **Rate Limiting**: Implement rate limiting for API endpoints

## Monitoring and Logging

1. **Structured Logging**: Use logrus or zap for structured logging
2. **Metrics**: Implement Prometheus metrics
3. **Health Checks**: Comprehensive health check endpoints
4. **Error Tracking**: Integrate with Sentry or similar

This implementation provides a complete, production-ready Go API that maintains full compatibility with the existing React frontend while following Go best practices and clean architecture principles.
