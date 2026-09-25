package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"blankpage_app/og"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var (
	db           *gorm.DB
	vercelOnce   sync.Once
	vercelRouter http.Handler
)

// Models
type Note struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Title     string    `gorm:"not null" json:"title"`
	Content   string    `gorm:"type:text" json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SharedNote struct {
	ID        uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	NoteID    uuid.UUID  `gorm:"type:uuid;not null" json:"note_id"`
	CreatedAt time.Time  `json:"created_at"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	Note      Note       `gorm:"foreignKey:NoteID" json:"note,omitempty"`
}

// Request structures for sharing
type ShareRequest struct {
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	ExpiryHours int        `json:"expiryHours"`
	ExpiresAt   *time.Time `json:"expiresAt"` // optional exact expiry; takes precedence over ExpiryHours
}

// SharedNoteResponse is the public, read-only view of a shared note.
type SharedNoteResponse struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Content   string     `json:"content"`
	CreatedAt time.Time  `json:"createdAt"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

const maxShareBodyBytes = 1 << 20 // 1 MiB

type ShareResponse struct {
	ShareID   string     `json:"shareId"`
	ShareURL  string     `json:"shareUrl"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

// BeforeCreate hooks to generate UUIDs
func (n *Note) BeforeCreate(tx *gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return nil
}

func (s *SharedNote) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// Handler for Vercel serverless function
func Handler(w http.ResponseWriter, r *http.Request) {
	vercelOnce.Do(func() {
		InitApp()
	})
	vercelRouter.ServeHTTP(w, r)
}

func InitApp() {
	initDBOptional()
	if db != nil {
		db.AutoMigrate(&Note{}, &SharedNote{})
		cleanupExpiredNotes()
	}
	vercelRouter = NewRouter()
}

func GetRouter() http.Handler {
	return vercelRouter
}

func initDBOptional() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set - running in no-share mode")
		return
	}

	connection, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Printf("Failed to connect database: %v (sharing disabled)", err)
		return
	}
	db = connection
	log.Println("Database connected - sharing enabled")
}

func NewRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	setupRoutes(r)
	return r
}

// The React app (web/) is served as static files by Vercel; only these routes reach Go.
func setupRoutes(r *gin.Engine) {
	// API routes
	api := r.Group("/api")
	{
		// Sharing - local storage to backend
		api.POST("/share", shareNoteHandler)
		api.GET("/shared/:shareId", getSharedNoteJSONHandler)

		// Link-preview images: /api/og/site.png and /api/og/<shareId>.png
		api.GET("/og/:name", ogImageHandler)
		api.HEAD("/og/:name", ogImageHandler)
	}

	// Shared note page: the React app shell with per-note link-preview meta tags
	r.GET("/shared/:shareId", sharedNotePageHandler)
	r.HEAD("/shared/:shareId", sharedNotePageHandler)

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().Unix(),
		})
	})
}

// cleanupExpiredNotes removes expired shared notes and their associated notes
func cleanupExpiredNotes() {
	if db == nil {
		return
	}

	now := time.Now()

	// Find expired shared notes
	var expiredSharedNotes []SharedNote
	if err := db.Where("expires_at IS NOT NULL AND expires_at < ?", now).Find(&expiredSharedNotes).Error; err != nil {
		log.Printf("Error finding expired shared notes: %v", err)
		return
	}

	if len(expiredSharedNotes) == 0 {
		return
	}

	// Delete expired shared notes and their associated notes
	for _, sharedNote := range expiredSharedNotes {
		// Delete the shared note entry
		if err := db.Delete(&sharedNote).Error; err != nil {
			log.Printf("Error deleting shared note %s: %v", sharedNote.ID, err)
			continue
		}

		// Delete the associated note (CASCADE should handle this, but being explicit)
		if err := db.Delete(&Note{}, sharedNote.NoteID).Error; err != nil {
			log.Printf("Error deleting note %s: %v", sharedNote.NoteID, err)
		}
	}

	log.Printf("Cleaned up %d expired shared notes", len(expiredSharedNotes))
}

// Handlers
func shareNoteHandler(c *gin.Context) {
	if db == nil { // sharing disabled when no database
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sharing disabled"})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxShareBodyBytes)
	var req ShareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Note is too large to share"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	if strings.TrimSpace(req.Title) == "" && strings.TrimSpace(req.Content) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note is empty"})
		return
	}

	// Create a new shared note entry
	shareID := uuid.New()

	var expiresAt *time.Time
	now := time.Now()
	switch {
	case req.ExpiresAt != nil:
		if !req.ExpiresAt.After(now.Add(30*time.Second)) || req.ExpiresAt.After(now.AddDate(10, 0, 0)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Expiry must be in the future"})
			return
		}
		expiry := req.ExpiresAt.UTC()
		expiresAt = &expiry
	case req.ExpiryHours > 0:
		if req.ExpiryHours > 24*365*10 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Expiry must be in the future"})
			return
		}
		expiry := now.Add(time.Duration(req.ExpiryHours) * time.Hour)
		expiresAt = &expiry
	}

	// Create temporary note for sharing
	note := Note{
		ID:        uuid.New(),
		Title:     req.Title,
		Content:   req.Content,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Save to database for sharing
	if err := db.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save note"})
		return
	}

	sharedNote := SharedNote{
		ID:        shareID,
		NoteID:    note.ID,
		CreatedAt: time.Now(),
		ExpiresAt: expiresAt,
	}

	if err := db.Create(&sharedNote).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create share link"})
		return
	}

	proto := c.Request.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = "https"
	}

	shareURL := fmt.Sprintf("%s://%s/shared/%s", proto, c.Request.Host, shareID.String())

	response := ShareResponse{
		ShareID:   shareID.String(),
		ShareURL:  shareURL,
		ExpiresAt: expiresAt,
	}

	c.JSON(http.StatusOK, response)
}

// lookupSharedNote returns the note behind a share id and the HTTP status that describes it.
func lookupSharedNote(shareID string) (*SharedNoteResponse, int) {
	if db == nil { // sharing disabled when no database
		return nil, http.StatusServiceUnavailable
	}
	shareUUID, err := uuid.Parse(shareID)
	if err != nil {
		return nil, http.StatusNotFound
	}

	var sharedNote SharedNote
	if err := db.Preload("Note").Where("id = ?", shareUUID).First(&sharedNote).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, http.StatusNotFound
		}
		log.Printf("Error loading shared note %s: %v", shareUUID, err)
		return nil, http.StatusInternalServerError
	}
	if sharedNote.ExpiresAt != nil && sharedNote.ExpiresAt.Before(time.Now()) {
		return nil, http.StatusGone
	}

	return &SharedNoteResponse{
		ID:        sharedNote.ID.String(),
		Title:     sharedNote.Note.Title,
		Content:   sharedNote.Note.Content,
		CreatedAt: sharedNote.CreatedAt,
		ExpiresAt: sharedNote.ExpiresAt,
	}, http.StatusOK
}

var sharedStatusNames = map[int]string{
	http.StatusOK:                  "ok",
	http.StatusNotFound:            "notfound",
	http.StatusGone:                "expired",
	http.StatusServiceUnavailable:  "disabled",
	http.StatusInternalServerError: "error",
}

func getSharedNoteJSONHandler(c *gin.Context) {
	note, status := lookupSharedNote(c.Param("shareId"))
	c.Header("Cache-Control", "no-store")
	if note == nil {
		c.JSON(status, gin.H{"error": sharedStatusNames[status]})
		return
	}
	c.JSON(http.StatusOK, note)
}

// sharedNotePageHandler serves the React app for /shared/:id with link-preview meta tags for that note,
// and inlines the note so the page renders without a second request. Old share links keep working.
func sharedNotePageHandler(c *gin.Context) {
	shareID := c.Param("shareId")
	note, status := lookupSharedNote(shareID)
	meta := sharedNoteMeta(requestOrigin(c.Request), shareID, note, status)

	shell, err := loadAppShell(c.Request)
	if err != nil {
		// Link previewers still get the note's meta tags; browsers hop to the SPA, which loads the note itself.
		log.Printf("Shared page shell unavailable (%v), serving a redirecting meta page", err)
		target := "/?shared=" + url.QueryEscape(shareID)
		js, _ := json.Marshal(target)
		page := fmt.Sprintf(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    %s
    <script>location.replace(%s)</script>
  </head>
  <body><a href="%s">Open this note on blank.</a></body>
</html>`, meta, js, html.EscapeString(target))
		c.Header("Cache-Control", "no-store")
		c.Data(status, "text/html; charset=utf-8", []byte(page))
		return
	}

	// json.Marshal escapes <, > and &, so the payload can't break out of the script tag.
	payload, _ := json.Marshal(gin.H{"id": shareID, "status": sharedStatusNames[status], "note": note})
	page := replaceBetween(shell, "<!-- meta:start", "<!-- meta:end -->", meta)
	page = strings.Replace(page, "</head>", `<script id="shared-data" type="application/json">`+string(payload)+"</script>\n  </head>", 1)

	c.Header("Cache-Control", "no-store")
	c.Data(status, "text/html; charset=utf-8", []byte(page))
}

// sharedNoteMeta builds the <head> tags link previewers read (Open Graph, Twitter, iMessage, Slack…).
func sharedNoteMeta(origin, shareID string, note *SharedNoteResponse, status int) string {
	pageURL := origin + "/shared/" + url.PathEscape(shareID)
	image := origin + "/api/og/" + url.PathEscape(shareID) + ".png"
	ogType := "article"
	var title, desc, alt string
	var extra []string

	switch {
	case note != nil:
		heading, body := og.Present(note.Title, note.Content)
		if heading == "" {
			heading = "Untitled note"
		}
		title = truncateRunes(heading, 90)
		// Only the title is public in previews; the body stays behind the link.
		count, read := og.Stats(og.WordCount(heading + " " + body))
		desc = "A note shared on blank. · " + count + " · " + read + "."
		alt = fmt.Sprintf("“%s” — a note shared on blank.", truncateRunes(heading, 120))
		extra = append(extra, `<meta property="article:published_time" content="`+note.CreatedAt.UTC().Format(time.RFC3339)+`" />`)
		if note.ExpiresAt != nil {
			extra = append(extra, `<meta property="article:expiration_time" content="`+note.ExpiresAt.UTC().Format(time.RFC3339)+`" />`)
		}
	case status == http.StatusGone:
		title = "This note has faded"
		desc = "It was shared on blank. with an expiry, and that time has passed. Write your own — it saves itself."
		alt = "This note has faded — blank."
	case status == http.StatusNotFound:
		title = "This note isn’t here"
		desc = "The link may be incomplete, or the note was removed. Write your own on blank. — it saves itself."
		alt = "This note isn’t here — blank."
	default:
		title = "A shared note"
		desc = "blank. — a quiet place for your thoughts. Local-first notes with share links that can expire."
		image = origin + "/api/og/site.png"
		alt = "blank. — a quiet place for your thoughts"
		ogType = "website"
	}

	e := html.EscapeString
	tags := []string{
		`<title>` + e(title) + ` — blank.</title>`,
		`<meta name="description" content="` + e(desc) + `" />`,
		`<meta name="robots" content="noindex" />`,
		`<link rel="canonical" href="` + e(pageURL) + `" />`,
		`<meta property="og:site_name" content="blank." />`,
		`<meta property="og:locale" content="en_US" />`,
		`<meta property="og:type" content="` + ogType + `" />`,
		`<meta property="og:url" content="` + e(pageURL) + `" />`,
		`<meta property="og:title" content="` + e(title) + `" />`,
		`<meta property="og:description" content="` + e(desc) + `" />`,
		`<meta property="og:image" content="` + e(image) + `" />`,
		`<meta property="og:image:type" content="image/png" />`,
		fmt.Sprintf(`<meta property="og:image:width" content="%d" />`, og.Width),
		fmt.Sprintf(`<meta property="og:image:height" content="%d" />`, og.Height),
		`<meta property="og:image:alt" content="` + e(alt) + `" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
		`<meta name="twitter:title" content="` + e(title) + `" />`,
		`<meta name="twitter:description" content="` + e(desc) + `" />`,
		`<meta name="twitter:image" content="` + e(image) + `" />`,
		`<meta name="twitter:image:alt" content="` + e(alt) + `" />`,
	}
	return strings.Join(append(tags, extra...), "\n    ")
}

var (
	siteCardOnce sync.Once
	siteCard     []byte
	siteCardErr  error
)

// ogImageHandler renders link-preview cards. Shares can't be edited, so a card only changes when its
// note expires; the CDN keeps it until then (at most a week).
func ogImageHandler(c *gin.Context) {
	name := c.Param("name")
	id, ok := strings.CutSuffix(name, ".png")
	if !ok {
		c.Status(http.StatusNotFound)
		return
	}

	var (
		img   []byte
		err   error
		cache = "public, max-age=86400, s-maxage=604800"
	)
	if id == "site" {
		siteCardOnce.Do(func() { siteCard, siteCardErr = og.Site() })
		img, err = siteCard, siteCardErr
	} else {
		note, status := lookupSharedNote(id)
		switch {
		case note != nil:
			ttl := 7 * 24 * time.Hour
			if note.ExpiresAt != nil {
				ttl = min(ttl, time.Until(*note.ExpiresAt))
			}
			secs := max(1, int(ttl.Seconds()))
			cache = fmt.Sprintf("public, max-age=%d, s-maxage=%d", min(secs, 3600), secs)
			img, err = og.SharedNote(og.Note{Title: note.Title, Content: note.Content, CreatedAt: note.CreatedAt, ExpiresAt: note.ExpiresAt})
		case status == http.StatusGone || status == http.StatusNotFound:
			cache = "public, max-age=300, s-maxage=3600"
			img, err = og.Unavailable(status == http.StatusGone)
		default:
			// sharing disabled or the database hiccuped: show the site card, briefly
			cache = "public, max-age=60, s-maxage=60"
			siteCardOnce.Do(func() { siteCard, siteCardErr = og.Site() })
			img, err = siteCard, siteCardErr
		}
	}
	if err != nil {
		log.Printf("Error rendering og image %s: %v", name, err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Cache-Control", cache)
	c.Data(http.StatusOK, "image/png", img)
}

func replaceBetween(s, start, end, with string) string {
	i := strings.Index(s, start)
	j := strings.Index(s, end)
	if i < 0 || j < i {
		return s
	}
	return s[:i] + with + s[j+len(end):]
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n]) + "…"
}

func requestOrigin(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = "http"
		if r.TLS != nil {
			proto = "https"
		}
	}
	return proto + "://" + r.Host
}

var (
	shellMu     sync.Mutex
	shellCache  = map[string]cachedShell{}
	shellClient = &http.Client{Timeout: 5 * time.Second}
)

type cachedShell struct {
	html string
	at   time.Time
}

// loadAppShell returns the built web/dist/index.html. Locally it's read from disk; on Vercel the static
// build isn't part of the function bundle, so it's fetched from this deployment's own domain — only for
// hosts Vercel reports as ours, so a spoofed Host header can't make us fetch (or cache) someone else's page.
func loadAppShell(r *http.Request) (string, error) {
	if b, err := os.ReadFile(filepath.Join("web", "dist", "index.html")); err == nil {
		return string(b), nil
	}

	host := strings.ToLower(r.Host)
	allowed := false
	for _, k := range []string{"VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"} {
		if v := strings.ToLower(os.Getenv(k)); v != "" && v == host {
			allowed = true
		}
	}
	if !allowed {
		return "", fmt.Errorf("host %q is not a known deployment host", r.Host)
	}

	shellMu.Lock()
	defer shellMu.Unlock()
	if s, ok := shellCache[host]; ok && time.Since(s.at) < 10*time.Minute {
		return s.html, nil
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, "https://"+host+"/index.html", nil)
	if err != nil {
		return "", err
	}
	resp, err := shellClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetching app shell: status %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	page := string(b)
	if !strings.Contains(page, "<!-- meta:start") {
		return "", errors.New("app shell is missing the meta:start marker")
	}
	shellCache[host] = cachedShell{html: page, at: time.Now()}
	return page, nil
}
