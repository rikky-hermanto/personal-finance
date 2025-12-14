# Personal Finance API (Go)

A simple REST API for managing personal financial transactions built with Go, Gin, and GORM.

## Features

- Transaction management (CRUD operations)
- Category rule management for automatic categorization
- PostgreSQL database with GORM ORM
- CORS support for frontend integration
- Health check endpoint

## Quick Start

### Prerequisites

- Go 1.21+
- PostgreSQL database

### Setup

1. Clone the repository and navigate to the api-go directory
2. Install dependencies:
   ```bash
   go mod tidy
   ```

3. Ensure PostgreSQL is running with a database named `personal_finance`

4. Run the API:
   ```bash
   go run .
   ```

The API will start on port 7208.

## API Endpoints

### Transactions

- `GET /api/transactions/health` - Health check
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Create a transaction
- `GET /api/transactions/:id` - Get transaction by ID
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Category Rules

- `GET /api/categoryrules` - Get all category rules
- `POST /api/categoryrules` - Create a category rule
- `GET /api/categoryrules/:id` - Get category rule by ID
- `PUT /api/categoryrules/:id` - Update category rule
- `DELETE /api/categoryrules/:id` - Delete category rule

## Database Schema

### Transaction
- id: uint (primary key)
- date: time.Time
- description: string
- remarks: string
- flow: string ("DB" or "CR")
- type: string ("Expense" or "Income")
- category: string
- wallet: string
- amountIdr: float64
- currency: string
- exchangeRate: *float64

### CategoryRule
- id: uint (primary key)
- keyword: string
- type: string
- category: string
- keywordLength: int (computed)

## Development

The API uses GORM for database operations and Gin for HTTP routing. Database migrations are handled automatically on startup.