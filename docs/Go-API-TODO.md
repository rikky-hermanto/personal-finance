# Go API Implementation TODO List

## Project Setup & Structure

### Initial Setup
- [ ] Create `api-go/` directory structure
- [ ] Initialize Go module (`go mod init personal-finance-api`)
- [ ] Set up `.gitignore` for Go project
- [ ] Create basic `README.md` for Go API
- [ ] Set up development environment configuration

### Dependencies
- [ ] Add Gin framework (`github.com/gin-gonic/gin`)
- [ ] Add GORM ORM (`gorm.io/gorm`, `gorm.io/driver/postgres`)
- [ ] Add CORS middleware (`github.com/gin-contrib/cors`)
- [ ] Add configuration management (`github.com/spf13/viper`)
- [ ] Add validation (`github.com/go-playground/validator/v10`)
- [ ] Add PDF processing (`github.com/unidoc/unipdf/v3`)
- [ ] Add database migrations (`github.com/golang-migrate/migrate/v4`)
- [ ] Add testing framework (`github.com/stretchr/testify`)

## Domain Layer

### Entities
- [ ] Implement `Transaction` entity (`internal/domain/entities/transaction.go`)
  - [ ] Define struct with proper GORM tags
  - [ ] Add table name method
  - [ ] Add validation tags
- [ ] Implement `CategoryRule` entity (`internal/domain/entities/category_rule.go`)
  - [ ] Define struct with proper GORM tags
  - [ ] Add computed `KeywordLength` field
  - [ ] Add GORM hooks for field computation

### Interfaces
- [ ] Create `TransactionRepository` interface (`internal/domain/interfaces/transaction_repository.go`)
- [ ] Create `CategoryRuleRepository` interface (`internal/domain/interfaces/category_rule_repository.go`)
- [ ] Create `BankStatementParser` interface (`internal/domain/interfaces/bank_parser.go`)

## Application Layer

### DTOs (Data Transfer Objects)
- [ ] Implement `TransactionDTO` (`internal/application/dtos/transaction_dto.go`)
  - [ ] Create main DTO struct
  - [ ] Add `CreateTransactionRequest` struct
  - [ ] Add `UpdateTransactionRequest` struct
  - [ ] Add validation tags
- [ ] Implement `CategoryRuleDTO` (`internal/application/dtos/category_rule_dto.go`)
  - [ ] Create main DTO struct
  - [ ] Add `CreateCategoryRuleRequest` struct
  - [ ] Add `UpdateCategoryRuleRequest` struct

### Services
- [ ] Implement `TransactionService` (`internal/application/services/transaction_service.go`)
  - [ ] `GetAll()` method
  - [ ] `GetByID()` method
  - [ ] `Create()` method with auto-categorization
  - [ ] `Update()` method
  - [ ] `Delete()` method
  - [ ] Entity to DTO conversion methods
- [ ] Implement `CategoryRuleService` (`internal/application/services/category_rule_service.go`)
  - [ ] `CategorizeAsync()` method (core business logic)
  - [ ] `GetAll()` method
  - [ ] `GetByID()` method
  - [ ] `Create()` method
  - [ ] `Update()` method
  - [ ] `Delete()` method
  - [ ] Keyword matching algorithm (case-insensitive, longest match)
- [ ] Implement `StatementImportService` (`internal/application/services/statement_import_service.go`)
  - [ ] Parser registration system
  - [ ] `ImportAsync()` method
  - [ ] Bank code detection logic

## Infrastructure Layer

### Database
- [ ] Implement PostgreSQL connection (`internal/infrastructure/database/postgres.go`)
  - [ ] Connection configuration
  - [ ] Auto-migration setup
  - [ ] Connection pooling
  - [ ] Health check functionality

### Repositories
- [ ] Implement `TransactionRepository` (`internal/infrastructure/repositories/transaction_repository.go`)
  - [ ] CRUD operations with GORM
  - [ ] Proper error handling
  - [ ] Context support
- [ ] Implement `CategoryRuleRepository` (`internal/infrastructure/repositories/category_rule_repository.go`)
  - [ ] CRUD operations with GORM
  - [ ] `FindByKeywordAndType()` method for categorization
  - [ ] Keyword search functionality

### Bank Statement Parsers
- [ ] Implement `BcaCsvParser` (`internal/infrastructure/parsers/bca_csv_parser.go`)
  - [ ] CSV parsing logic
  - [ ] BCA-specific date format handling
  - [ ] Amount parsing with Indonesian formatting
  - [ ] Auto-categorization integration
- [ ] Implement `NeoBankPdfParser` (`internal/infrastructure/parsers/neobank_pdf_parser.go`)
  - [ ] PDF text extraction
  - [ ] Regex patterns for transaction parsing
  - [ ] European decimal format handling
  - [ ] Date/time parsing
- [ ] Implement `DefaultCsvParser` (`internal/infrastructure/parsers/default_csv_parser.go`)
  - [ ] Generic CSV parsing with flexible headers
  - [ ] Column mapping logic
  - [ ] Multiple date format support
  - [ ] Currency amount parsing

## API Layer (Interfaces)

### HTTP Handlers
- [ ] Implement `TransactionHandler` (`internal/interfaces/handlers/transaction_handler.go`)
  - [ ] `GET /api/transactions/health` - Health check
  - [ ] `GET /api/transactions/supported-types` - Supported file types
  - [ ] `GET /api/transactions` - List all transactions
  - [ ] `GET /api/transactions/:id` - Get transaction by ID
  - [ ] `POST /api/transactions` - Create transaction
  - [ ] `PUT /api/transactions/:id` - Update transaction
  - [ ] `DELETE /api/transactions/:id` - Delete transaction
  - [ ] `POST /api/transactions/upload-preview` - File upload preview
- [ ] Implement `CategoryRuleHandler` (`internal/interfaces/handlers/category_rule_handler.go`)
  - [ ] `GET /api/categoryrules` - List all rules
  - [ ] `GET /api/categoryrules/:id` - Get rule by ID
  - [ ] `POST /api/categoryrules` - Create rule
  - [ ] `PUT /api/categoryrules/:id` - Update rule
  - [ ] `DELETE /api/categoryrules/:id` - Delete rule

### Middleware
- [ ] Implement CORS middleware (`internal/interfaces/middleware/cors.go`)
- [ ] Implement error handling middleware (`internal/interfaces/middleware/error_handler.go`)
- [ ] Add request logging middleware
- [ ] Add validation middleware

### Main Application
- [ ] Implement main server (`cmd/server/main.go`)
  - [ ] Dependency injection setup
  - [ ] Router configuration
  - [ ] Middleware registration
  - [ ] Route setup
  - [ ] Server startup logic

## Utilities

### Date Parsing
- [ ] Implement `ParseBCADate()` (`pkg/utils/date_parser.go`)
- [ ] Implement `ParseGenericDate()` for multiple formats
- [ ] Add timezone handling (UTC conversion)

### Amount Parsing
- [ ] Implement `ParseAmount()` (`pkg/utils/amount_parser.go`)
  - [ ] Currency symbol removal
  - [ ] European vs US decimal format detection
  - [ ] Thousands separator handling
  - [ ] Negative amount parsing (parentheses)
- [ ] Implement `ParseEuropeanDecimal()` for PDF parsing

### File Utilities
- [ ] Implement file type detection (`pkg/utils/file_utils.go`)
- [ ] Add file size validation
- [ ] Add MIME type validation

## Configuration

### Config Management
- [ ] Implement configuration struct (`configs/config.go`)
- [ ] Set up Viper for environment variables
- [ ] Create default values
- [ ] Add validation for required configs

### Environment Setup
- [ ] Create `.env` template file
- [ ] Document all environment variables
- [ ] Set up different configs for dev/staging/prod

## Database

### Migrations
- [ ] Create `001_create_transactions.up.sql`
- [ ] Create `001_create_transactions.down.sql`
- [ ] Create `002_create_category_rules.up.sql`
- [ ] Create `002_create_category_rules.down.sql`
- [ ] Create `003_seed_category_rules.up.sql` with all 100+ rules from .NET version
- [ ] Create `003_seed_category_rules.down.sql`
- [ ] Add proper indexes for performance

### Data Migration
- [ ] Extract all category rules from .NET version
- [ ] Format rules for PostgreSQL insertion
- [ ] Verify rule accuracy and completeness

## Docker & Deployment

### Docker Configuration
- [ ] Create `Dockerfile` for production build
- [ ] Create `docker-compose.yml` for development
- [ ] Add PostgreSQL service configuration
- [ ] Configure volume mounts
- [ ] Set up environment variable passing

### Scripts
- [ ] Create `scripts/setup.sh` for initial setup
- [ ] Create `scripts/run-dev.sh` for development
- [ ] Create `scripts/build.sh` for production build
- [ ] Create `scripts/migrate.sh` for database migrations

## Testing

### Unit Tests
- [ ] Test `TransactionService` methods
- [ ] Test `CategoryRuleService` categorization logic
- [ ] Test `BcaCsvParser` parsing logic
- [ ] Test `NeoBankPdfParser` parsing logic
- [ ] Test `DefaultCsvParser` parsing logic
- [ ] Test date parsing utilities
- [ ] Test amount parsing utilities

### Integration Tests
- [ ] Test repository operations with real database
- [ ] Test complete transaction workflow
- [ ] Test file upload and parsing workflow
- [ ] Test API endpoints with HTTP requests

### Test Data
- [ ] Create sample BCA CSV files
- [ ] Create sample NeoBank PDF files
- [ ] Create sample generic CSV files
- [ ] Create test transaction data

## Quality Assurance

### Code Quality
- [ ] Set up linting with `golangci-lint`
- [ ] Add pre-commit hooks
- [ ] Set up code formatting with `gofmt`
- [ ] Add code coverage reporting

### Documentation
- [ ] Create API documentation (OpenAPI/Swagger)
- [ ] Document all public functions
- [ ] Create example requests/responses
- [ ] Update main README with Go API instructions

## Performance & Optimization

### Database Optimization
- [ ] Add proper database indexes
- [ ] Configure connection pooling
- [ ] Implement query optimization
- [ ] Add database health checks

### File Processing
- [ ] Implement streaming for large files
- [ ] Add file size limits
- [ ] Optimize memory usage for parsing
- [ ] Add progress tracking for large uploads

### Caching
- [ ] Implement in-memory cache for category rules
- [ ] Add Redis caching layer (optional)
- [ ] Cache frequently accessed data

## Security

### Input Validation
- [ ] Validate all API inputs
- [ ] Sanitize file uploads
- [ ] Validate file types and sizes
- [ ] Add SQL injection protection (via GORM)

### Security Headers
- [ ] Add security middleware
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Implement request timeouts

## Monitoring & Observability

### Logging
- [ ] Implement structured logging
- [ ] Add request/response logging
- [ ] Log all errors with context
- [ ] Add log levels configuration

### Health Checks
- [ ] Database connectivity check
- [ ] Service health endpoints
- [ ] Dependency health monitoring

### Metrics (Optional)
- [ ] Add Prometheus metrics
- [ ] Monitor API response times
- [ ] Track error rates
- [ ] Monitor resource usage

## Frontend Integration

### API Compatibility
- [ ] Verify JSON response formats match .NET version
- [ ] Test all endpoints with existing React frontend
- [ ] Ensure error response formats are consistent
- [ ] Validate file upload behavior matches expectations

### Cross-Origin Setup
- [ ] Configure CORS for frontend domain
- [ ] Test preflight requests
- [ ] Verify cookie/session handling if needed

## Final Verification

### End-to-End Testing
- [ ] Test complete transaction workflow
- [ ] Test file upload and categorization
- [ ] Test category rule management
- [ ] Performance testing with large datasets
- [ ] Load testing for concurrent users

### Production Readiness
- [ ] Security audit
- [ ] Performance benchmarking
- [ ] Documentation review
- [ ] Deployment procedure testing
- [ ] Backup and recovery procedures

## Deployment

### Environment Setup
- [ ] Production database setup
- [ ] Environment variable configuration
- [ ] SSL/TLS certificate setup
- [ ] Reverse proxy configuration (nginx/traefik)

### CI/CD Pipeline
- [ ] Set up automated testing
- [ ] Configure build pipeline
- [ ] Set up deployment automation
- [ ] Add rollback procedures

---

## Progress Tracking

**Legend:**
- [ ] Not started
- [ ] In progress
- [ ] Completed
- [ ] Blocked
- [ ] Needs review

**Priority Levels:**
- 🔴 High Priority (Core functionality)
- 🟡 Medium Priority (Important features)
- 🟢 Low Priority (Nice to have)

**Estimated Timeline:** 
- Core functionality: 2-3 weeks
- Testing & optimization: 1 week  
- Documentation & deployment: 1 week
- **Total: 4-5 weeks for complete implementation**
