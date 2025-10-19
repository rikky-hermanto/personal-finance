#!/bin/bash

# Personal Finance API - Development Setup Script

set -e

echo "🚀 Setting up Personal Finance Go API..."

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.21 or higher."
    echo "   Download from: https://golang.org/dl/"
    exit 1
fi

# Check Go version
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
REQUIRED_VERSION="1.21"
if ! printf '%s\n%s\n' "$REQUIRED_VERSION" "$GO_VERSION" | sort -V -C; then
    echo "❌ Go version $GO_VERSION is too old. Please upgrade to Go 1.21 or higher."
    exit 1
fi

echo "✅ Go version $GO_VERSION is compatible"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please update with your database credentials."
else
    echo "✅ .env file already exists"
fi

# Create config file if it doesn't exist
if [ ! -f configs/config.yaml ]; then
    echo "📄 Creating config.yaml file from template..."
    cp configs/config.example.yaml configs/config.yaml
    echo "✅ config.yaml file created"
else
    echo "✅ config.yaml file already exists"
fi

# Download Go dependencies
echo "📦 Downloading Go dependencies..."
go mod download

# Check if PostgreSQL is running
echo "🔍 Checking PostgreSQL connection..."
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL client (psql) not found. Please install PostgreSQL."
    echo "   Or use Docker: docker run --name personal-finance-db -e POSTGRES_PASSWORD=postgres123 -p 5432:5432 -d postgres:15"
else
    # Try to connect to PostgreSQL
    if PGPASSWORD=postgres123 psql -h localhost -p 5432 -U postgres -d postgres -c '\q' 2>/dev/null; then
        echo "✅ PostgreSQL is running and accessible"
        
        # Check if database exists
        DB_EXISTS=$(PGPASSWORD=postgres123 psql -h localhost -p 5432 -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='personal_finance';" | grep -c 1 || true)
        if [ "$DB_EXISTS" -eq 1 ]; then
            echo "✅ Database 'personal_finance' already exists"
        else
            echo "📊 Creating database 'personal_finance'..."
            PGPASSWORD=postgres123 createdb -h localhost -p 5432 -U postgres personal_finance
            echo "✅ Database 'personal_finance' created"
        fi
    else
        echo "⚠️  Cannot connect to PostgreSQL. Please ensure PostgreSQL is running."
        echo "   Connection details: localhost:5432, user: postgres, password: postgres123"
        echo "   Or start with Docker: docker run --name personal-finance-db -e POSTGRES_PASSWORD=postgres123 -p 5432:5432 -d postgres:15"
    fi
fi

# Make scripts executable
chmod +x scripts/*.sh 2>/dev/null || true

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your database credentials (if needed)"
echo "2. Run database migrations: ./scripts/migrate.sh up"
echo "3. Start the development server: ./scripts/run-dev.sh"
echo ""
echo "Or run manually:"
echo "   go run cmd/server/main.go"
echo ""
echo "API will be available at: http://localhost:7208"
echo "Health check: http://localhost:7208/api/transactions/health"