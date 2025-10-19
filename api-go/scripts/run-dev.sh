#!/bin/bash

# Personal Finance API - Development Server

set -e

echo "🚀 Starting Personal Finance API development server..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded from .env"
else
    echo "⚠️  .env file not found. Using default values."
fi

# Check if database is running
echo "🔍 Checking database connection..."
if command -v psql &> /dev/null; then
    DB_HOST=${PF_DATABASE_HOST:-localhost}
    DB_PORT=${PF_DATABASE_PORT:-5432}
    DB_USER=${PF_DATABASE_USER:-postgres}
    DB_PASSWORD=${PF_DATABASE_PASSWORD:-postgres123}
    DB_NAME=${PF_DATABASE_NAME:-personal_finance}
    
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c '\q' 2>/dev/null; then
        echo "✅ Database connection successful"
    else
        echo "❌ Cannot connect to database. Please check your database configuration."
        echo "   Host: $DB_HOST:$DB_PORT"
        echo "   User: $DB_USER"
        echo "   Database: $DB_NAME"
        exit 1
    fi
else
    echo "⚠️  PostgreSQL client not found. Skipping database check."
fi

# Run the server
SERVER_PORT=${PF_SERVER_PORT:-7208}
echo "🌐 Starting server on port $SERVER_PORT..."

# Check if Air is available for hot reload
if command -v air &> /dev/null; then
    echo "🔥 Using Air for hot reload..."
    air
else
    echo "📦 Air not found. Running without hot reload..."
    echo "   Install Air for hot reload: go install github.com/cosmtrek/air@latest"
    go run cmd/server/main.go
fi