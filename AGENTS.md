# AGENTS.md - Coding Guidelines for Blank Page App

## Project Overview
A minimalist note-taking app with Go (Gin) backend deployed on Vercel as serverless functions. Uses localStorage for notes with optional PostgreSQL sharing.

## Project Structure

```
blankpage_app/
├── api/
│   ├── app.go              # Vercel serverless entry point (ALL logic here)
│   ├── templates/          # HTML templates (embedded)
│   └── static/             # Static assets (embedded)
├── main.go                 # Local development entry (imports from api/)
├── go.mod                  # Go module: blankpage_app
├── go.sum                  # Dependencies
├── vercel.json             # Vercel routing config
├── .env.example            # Environment template
└── init.sql                # Database schema
```

**CRITICAL**: Vercel ONLY deploys the `/api` folder. The root `main.go` is for local development only and imports from the `api` package.

## Build Commands

```bash
# Install dependencies
go mod tidy

# Build for local development
go build -o main .

# Run locally (uses main.go which imports from api/)
go run .

# Test Vercel build (compiles api/ folder only)
cd api && go build -o /tmp/api_test .

# Test a single function
go test -v ./api/... -run TestFunctionName

# Test all
go test ./...

# Format code
go fmt ./...

# Vet code
go vet ./...
```

## Vercel Deployment

```bash
vercel              # Deploy preview
vercel --prod       # Deploy production
vercel logs         # View logs
```

## Code Style Guidelines

### Package Names
- **Vercel handler**: `package handler` (in `api/app.go`)
- **Local dev**: `package main` (in root `main.go`)
- **Import path**: `blankpage_app/api` (imports as `handler`)

### Imports (Standard Go Ordering)
```go
import (
    // Standard library (alphabetical)
    "embed"
    "fmt"
    "net/http"
    
    // Third-party (alphabetical)
    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "gorm.io/driver/postgres"
    "gorm.io/gorm"
)
```

### Naming Conventions
- **Exported**: PascalCase (`Handler`, `ShareRequest`, `InitApp`)
- **Unexported**: camelCase (`vercelRouter`, `initDB`)
- **Constants**: PascalCase or camelCase (not SCREAMING_SNAKE)
- **Files**: snake_case.go

### Types & Structs
```go
type ShareRequest struct {
    Title       string `json:"title"`       // JSON tags always lowercase
    ExpiryHours int    `json:"expiryHours"` // camelCase in JSON
}

type Note struct {
    ID        uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
    Title     string    `gorm:"not null" json:"title"`
    CreatedAt time.Time `json:"created_at"`  // snake_case for API consistency
}
```

### Error Handling
```go
// Check errors explicitly, never ignore
if err := db.Create(&note).Error; err != nil {
    c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save"})
    return
}

// Log errors with context
log.Printf("Error deleting note %s: %v", noteID, err)

// HTTP status codes: 400 (Bad Request), 404 (Not Found), 500 (Internal Error), 503 (Service Unavailable)
```

### Handler Pattern (Vercel)
```go
// Handler is the entry point for Vercel serverless functions
func Handler(w http.ResponseWriter, r *http.Request) {
    vercelOnce.Do(func() {
        InitApp()
    })
    vercelRouter.ServeHTTP(w, r)
}

// InitApp is exported for use by local development server
func InitApp() {
    initDBOptional()
    if db != nil {
        db.AutoMigrate(&Note{}, &SharedNote{})
        cleanupExpiredNotes()
    }
    vercelRouter = NewRouter()
}
```

### Database Operations
- Always check if `db == nil` before DB operations
- Gracefully degrade when DATABASE_URL not set
- Use GORM's `AutoMigrate` for schema changes

### Embedded Files
```go
//go:embed templates/* static/*
var embeddedFS embed.FS

// Parse templates once at startup
tmpl, _ := template.ParseFS(embeddedFS, "templates/*.html")
```

## Environment Variables

```bash
DATABASE_URL=postgres://user:pass@host/db?sslmode=require  # Optional
PORT=8080                                                   # Local dev only
```

## Testing Guidelines

```bash
# Run specific test
go test -v -run TestShareNote

# Run with coverage
go test -cover ./...
```

## Common Pitfalls

1. **Don't modify main.go and forget `api/app.go`** - api/ is the source of truth
2. **Don't use `package main` in `/api` folder** - Must be `package handler`
3. **Don't forget embed directives** when adding new static files
4. **Always check `db != nil`** before database operations
5. **Use `sync.Once`** for Vercel initialization to avoid re-initializing on each request
6. **Export functions from api/** that local dev needs (InitApp, GetRouter)

## Vercel Routing

All routes go through `/api/app` per `vercel.json`:
```json
{
  "routes": [
    { "src": "/(.*)", "dest": "/api/app" }
  ]
}
```

## Single Source of Truth

All business logic lives in `/api/app.go`. Root `main.go` is just a thin wrapper:

```go
// main.go - Local development entry point
package main

import (
    handler "blankpage_app/api"
)

func main() {
    handler.InitApp()
    router := handler.GetRouter()
    // ... start server
}
```

This ensures:
- No code duplication
- Vercel deployment uses same code as local dev
- Single place to make changes
