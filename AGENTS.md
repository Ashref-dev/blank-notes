# AGENTS.md - Coding Guidelines for Blank Page App

## Project Overview
A minimalist note-taking app: a React 19 SPA (`web/`, Vite + Tailwind v4 + React Compiler) served as static files, plus a Go (Gin) API deployed on Vercel as a serverless function. Notes live in the browser (localStorage, images in IndexedDB); PostgreSQL is only used for share links.

## Project Structure

```
blankpage_app/
├── api/
│   └── app.go              # Vercel serverless function (ALL Go logic here)
├── web/                    # React app (built to web/dist, served statically by Vercel)
│   ├── index.html          # Keep the <!-- meta:start/end --> markers: api/app.go swaps them for shared notes
│   ├── public/static/      # favicon, og.jpg (served at /static/...)
│   └── src/
│       ├── lib/storage.ts      # localStorage format (shared with the previous app — do not change keys/shape)
│       ├── lib/attachments.ts  # IndexedDB "blankpage-attachments" (shared with the previous app)
│       └── lib/api.ts          # client for /api/share and /api/shared/:id
├── og/                     # Link-preview image renderer (imported by api/app.go; fonts embedded)
│   ├── og.go / text.go     # 1200×630 PNG cards: site, shared note, faded/missing
│   └── fonts/              # Instrument Serif, Geist, Geist Mono (OFL)
├── main.go                 # Local dev: serves web/dist + routes /api, /shared, /health to api/
├── go.mod / go.sum         # Go module: blankpage_app
├── vercel.json             # Build web/, route API paths to /api/app, SPA fallback
└── init.sql                # Database schema
```

**CRITICAL**: Vercel builds `web/` into `web/dist` (static) and `api/app.go` (function). The root `main.go` is for local development only.

**Storage compatibility**: notes are stored under `blankpage_notes` as `{ [id]: { id, title, content, createdAt, updatedAt, pinned? } }` where `content` is the source of truth (first line = title). Also `blankpage_last_note`, `theme`, and the `?note=<id>` URL param. Existing users depend on this — keep it backward compatible.

## Build Commands

```bash
# Frontend
cd web && npm ci
npm run dev                  # Vite on :5173, proxies /api to the Go server on :8080
npm run build                # tsc + vite build -> web/dist

# Backend (from repo root)
go run .                     # API on :8080; also serves web/dist if built
go build ./... && go vet ./...
cd api && go build -o /tmp/api_test .   # Vercel-style build of the function only
go test ./...
go fmt ./...
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

### Frontend
- Static assets go in `web/public/`. `web/public/static/og.png` is the homepage card rendered by `og.Site()` — regenerate it after changing the card design: `OG_OUT=/tmp/og go test -run TestCards ./og && cp /tmp/og/site.png web/public/static/og.png`.

### Link previews
- `/shared/:id` injects per-note meta (title, excerpt, `og:image` + size/alt, `article:*` times, Twitter card, `noindex`) between the `index.html` markers; if the app shell can't be loaded it serves a meta-only page that redirects browsers to `/?shared=<id>`.
- `/api/og/<id>.png` and `/api/og/site.png` render cards with `og/`. Shares are immutable, so cards are CDN-cached until the note expires (max 7 days).
- Helper packages for the Vercel function live outside `api/` (every `.go` file in `api/` becomes its own function).
- The React Compiler is on (Babel preset): no manual `useMemo`/`useCallback` needed for new code, and avoid `eslint-disable` comments, reading refs during render, or `throw` inside `try` in components — the compiler skips those components.

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
3. **Keep `web/index.html` meta markers** — `/shared/:id` injects per-note link-preview tags there
4. **Always check `db != nil`** before database operations
5. **Use `sync.Once`** for Vercel initialization to avoid re-initializing on each request
6. **Export functions from api/** that local dev needs (InitApp, GetRouter)

## Vercel Routing

`vercel.json` sends `/api/*`, `/shared/*` and `/health` to the Go function (`/api/app`); everything else is served from `web/dist`, falling back to `index.html` for client-side routes. `main.go` mirrors the same split locally.

## Single Source of Truth

All HTTP handling lives in `/api/app.go` (image rendering is in `og/`). Root `main.go` is just a thin wrapper:

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
