# Personal Finance API - Go Implementation

A Go implementation of the Personal Finance API that provides transaction management and bank statement parsing capabilities. This API is fully compatible with the existing React frontend.

## 🏗️ Architecture

This project follows Clean Architecture principles with clear separation of concerns:

```
api-go/
├── cmd/server/           # Application entry point
├── internal/
│   ├── domain/          # Business entities and interfaces
│   ├── application/     # Use cases and business logic
│   ├── infrastructure/  # External concerns (DB, file parsing)
│   └── interfaces/      # HTTP handlers and middleware
├── pkg/                 # Shared utilities
├── configs/             # Configuration management
├── migrations/          # Database migrations
├── scripts/             # Development and deployment scripts
└── tests/               # Test suites
```

## 🚀 Quick Start

### Prerequisites

- Go 1.21 or higher
- PostgreSQL 13+
- Git

### Development Setup

1. **Clone and navigate to the Go API directory:**
   ```bash
   cd api-go
   ```

2. **Install dependencies:**
   ```bash
   go mod download
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Start PostgreSQL database:**
   ```bash
   # Option 1: Using Docker
   docker run --name personal-finance-db -e POSTGRES_PASSWORD=postgres123 -p 5432:5432 -d postgres:15

   # Option 2: Use existing PostgreSQL installation
   # Make sure PostgreSQL is running on localhost:5432
   ```

5. **Run database migrations:**
   ```bash
   ./scripts/migrate.sh up
   ```

6. **Start the development server:**
   ```bash
   go run cmd/server/main.go
   ```

The API will be available at `http://localhost:7208`

### Production Build

```bash
# Build binary
go build -o personal-finance-api cmd/server/main.go

# Run production server
./personal-finance-api
```

## 🐳 Docker Support

### Development with Docker Compose

```bash
# Start all services (API + PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Production Docker

```bash
# Build production image
docker build -t personal-finance-api .

# Run container
docker run -p 7208:7208 --env-file .env personal-finance-api
```

## 📊 API Endpoints

### Health Check
- `GET /api/transactions/health` - Service health status

### Transactions
- `GET /api/transactions` - List all transactions
- `GET /api/transactions/:id` - Get transaction by ID
- `POST /api/transactions` - Create new transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction
- `POST /api/transactions/upload-preview` - Upload and preview bank statement

### Category Rules
- `GET /api/categoryrules` - List all category rules
- `GET /api/categoryrules/:id` - Get category rule by ID
- `POST /api/categoryrules` - Create new category rule
- `PUT /api/categoryrules/:id` - Update category rule
- `DELETE /api/categoryrules/:id` - Delete category rule

### Supported File Types
- `GET /api/transactions/supported-types` - Get supported bank statement formats

## 🏦 Supported Bank Formats

### Bank Statement Parsers
- **BCA CSV**: Indonesian BCA bank CSV exports
- **NeoBank PDF**: NeoBank statement PDFs
- **Generic CSV**: Standard CSV format with flexible column mapping

### File Upload Examples

```bash
# Upload BCA CSV file
curl -X POST http://localhost:7208/api/transactions/upload-preview \
  -F "file=@statement.csv"

# Upload PDF with password
curl -X POST http://localhost:7208/api/transactions/upload-preview \
  -F "file=@statement.pdf" \
  -F "pdfPassword=yourpassword"
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PF_DATABASE_HOST` | `localhost` | PostgreSQL host |
| `PF_DATABASE_PORT` | `5432` | PostgreSQL port |
| `PF_DATABASE_USER` | `postgres` | Database user |
| `PF_DATABASE_PASSWORD` | `postgres123` | Database password |
| `PF_DATABASE_NAME` | `personal_finance` | Database name |
| `PF_DATABASE_SSL_MODE` | `disable` | SSL mode for database |
| `PF_SERVER_PORT` | `7208` | API server port |
| `PF_SERVER_CORS_ALLOWED_ORIGINS` | `http://localhost:8080` | CORS allowed origins |

### Configuration File

Create `configs/config.yaml`:

```yaml
server:
  port: "7208"
  cors_allowed_origins: "http://localhost:8080"

database:
  host: "localhost"
  port: "5432"
  user: "postgres"
  password: "postgres123"
  name: "personal_finance"
  ssl_mode: "disable"
```

## 🧪 Testing

### Run Tests

```bash
# Unit tests
go test ./tests/unit/...

# Integration tests
go test ./tests/integration/...

# All tests with coverage
go test -cover ./...

# Generate coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Test Data

Sample files for testing are available in `tests/data/`:
- `sample_bca.csv` - BCA bank statement
- `sample_neobank.pdf` - NeoBank statement
- `sample_generic.csv` - Generic CSV format

## 🔨 Development Scripts

### Available Scripts

```bash
# Setup development environment
./scripts/setup.sh

# Run development server with hot reload
./scripts/run-dev.sh

# Build production binary
./scripts/build.sh

# Run database migrations
./scripts/migrate.sh up

# Rollback database migrations
./scripts/migrate.sh down

# Reset database (drop all tables and recreate)
./scripts/reset-db.sh
```

## 📈 Performance Features

### Optimizations
- **Database Connection Pooling**: Configured GORM connection pool
- **Indexed Queries**: Proper database indexes on frequently queried columns
- **Streaming File Processing**: Memory-efficient parsing of large files
- **Response Caching**: In-memory caching for category rules

### Monitoring
- **Health Checks**: `/api/transactions/health` endpoint
- **Structured Logging**: JSON logs with request correlation IDs
- **Metrics**: Request duration and error rate tracking (optional Prometheus integration)

## 🔒 Security

### Security Features
- **Input Validation**: All API inputs validated using Go validator
- **SQL Injection Protection**: GORM prepared statements
- **File Upload Security**: Type and size validation
- **CORS Protection**: Configurable CORS policies
- **Request Size Limits**: Configurable request body size limits

### Security Headers
- Request timeout protection
- Rate limiting (configurable)
- Security headers middleware

## 🚀 Deployment

### Production Checklist

- [ ] Set secure database credentials
- [ ] Configure CORS for production domains
- [ ] Set up reverse proxy (nginx/traefik)
- [ ] Configure SSL/TLS certificates
- [ ] Set up monitoring and logging
- [ ] Configure backup procedures

### Environment Setup

1. **Production Database:**
   ```bash
   # Create production database
   createdb personal_finance_prod
   
   # Run migrations
   PF_DATABASE_NAME=personal_finance_prod ./scripts/migrate.sh up
   ```

2. **Systemd Service (Linux):**
   ```ini
   # /etc/systemd/system/personal-finance-api.service
   [Unit]
   Description=Personal Finance API
   After=postgresql.service
   
   [Service]
   Type=simple
   User=app
   WorkingDirectory=/opt/personal-finance-api
   ExecStart=/opt/personal-finance-api/personal-finance-api
   EnvironmentFile=/opt/personal-finance-api/.env
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

3. **Nginx Configuration:**
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:7208;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

## 🐛 Troubleshooting

### Common Issues

**Database Connection Failed:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Verify connection settings
psql -h localhost -p 5432 -U postgres -d personal_finance
```

**Port Already in Use:**
```bash
# Check what's using port 7208
netstat -tulpn | grep 7208

# Change port in environment
export PF_SERVER_PORT=7209
```

**File Upload Errors:**
- Check file size limits (default 32MB)
- Verify file format is supported
- Ensure proper Content-Type headers

**CORS Errors:**
- Verify `PF_SERVER_CORS_ALLOWED_ORIGINS` includes frontend URL
- Check browser developer tools for specific CORS errors

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
go run cmd/server/main.go
```

## 📝 API Documentation

### Interactive API Documentation
When running in development mode, Swagger UI is available at:
`http://localhost:7208/swagger/index.html`

### Example Requests

**Create Transaction:**
```bash
curl -X POST http://localhost:7208/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-01-15T00:00:00Z",
    "description": "Grocery shopping",
    "amount_idr": 150000,
    "wallet": "BCA",
    "flow": "DB",
    "type": "Expense"
  }'
```

**Upload File:**
```bash
curl -X POST http://localhost:7208/api/transactions/upload-preview \
  -F "file=@bank_statement.csv"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Follow Go conventions (`go fmt`, `go vet`)
- Add tests for new features
- Update documentation for API changes
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For questions or issues:
1. Check the [troubleshooting section](#🐛-troubleshooting)
2. Search existing [GitHub issues](https://github.com/rikky-hermanto/personal-finance/issues)
3. Create a new issue with detailed description

## 🗺️ Roadmap

- [ ] Authentication and authorization
- [ ] Real-time transaction notifications
- [ ] Advanced analytics and reporting
- [ ] Mobile app API support
- [ ] Multi-currency support improvements
- [ ] Machine learning categorization

---

**🔗 Related Documentation:**
- [Frontend Documentation](../docs/Front-End.md)
- [.NET API Documentation](../docs/API-backend.md)
- [Go Implementation Guide](../docs/Go-API-Implementation.md)