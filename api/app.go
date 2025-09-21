package handler

import (
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:embed templates/* static/*
var embeddedFS embed.FS

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
	Title       string `json:"title"`
	Content     string `json:"content"`
	ExpiryHours int    `json:"expiryHours"`
}

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

// Helper functions
func (n *Note) GetTitle() string {
	if n.Title != "" {
		return n.Title
	}
	// Auto-generate title from first line of content
	if len(n.Content) > 50 {
		return n.Content[:50] + "..."
	}
	if n.Content == "" {
		return "Untitled Note"
	}
	return n.Content
}

func (n *Note) WordCount() int {
	if n.Content == "" {
		return 0
	}
	words := 0
	inWord := false
	for _, char := range n.Content {
		if char == ' ' || char == '\n' || char == '\t' {
			inWord = false
		} else if !inWord {
			words++
			inWord = true
		}
	}
	return words
}

func (n *Note) CharCount() int {
	return len(n.Content)
}

// Handler for Vercel serverless function
func Handler(w http.ResponseWriter, r *http.Request) {
	vercelOnce.Do(func() {
		initDBOptional()
		if db != nil {
			db.AutoMigrate(&Note{}, &SharedNote{})
			cleanupExpiredNotes()
		}
		vercelRouter = NewRouter()
	})
	vercelRouter.ServeHTTP(w, r)
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

	// Templates from embedded FS
	if tmpl, err := template.ParseFS(embeddedFS, "templates/*.html"); err == nil {
		r.SetHTMLTemplate(tmpl)
	} else {
		log.Printf("template parse error: %v", err)
	}

	// Static files from embedded FS
	if sub, err := fs.Sub(embeddedFS, "static"); err == nil {
		r.StaticFS("/static", http.FS(sub))
	} else {
		log.Printf("static fs error: %v", err)
	}

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

func setupRoutes(r *gin.Engine) {
	// Main page
	r.GET("/", indexHandler)

	// API routes
	api := r.Group("/api")
	{
		// Sharing - local storage to backend
		api.POST("/share", shareNoteHandler)
		api.GET("/shared/:shareId", getSharedNoteHandler)

		// Download routes
		api.GET("/notes/:id/download/:format", downloadNoteHandler)

		// Search and stats
		api.GET("/search", searchNotesHandler)
		api.GET("/stats", statsHandler)
	}

	// Shared note view (HTML)
	r.GET("/shared/:shareId", getSharedNoteHandler)

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
func indexHandler(c *gin.Context) {
	c.HTML(http.StatusOK, "index.html", gin.H{
		"title": "blank.ashref.tn",
	})
}

func shareNoteHandler(c *gin.Context) {
	if db == nil { // sharing disabled when no database
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sharing disabled"})
		return
	}

	var req ShareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Create a new shared note entry
	shareID := uuid.New()

	var expiresAt *time.Time
	if req.ExpiryHours > 0 {
		expiry := time.Now().Add(time.Duration(req.ExpiryHours) * time.Hour)
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

func getSharedNoteHandler(c *gin.Context) {
	if db == nil { // sharing disabled when no database
		c.HTML(http.StatusServiceUnavailable, "shared_not_found.html", gin.H{"title": "Sharing Disabled"})
		return
	}

	shareID := c.Param("shareId")

	shareUUID, err := uuid.Parse(shareID)
	if err != nil {
		c.HTML(http.StatusNotFound, "shared_not_found.html", gin.H{
			"title": "Note Not Found",
		})
		return
	}

	var sharedNote SharedNote
	if err := db.Preload("Note").Where("id = ?", shareUUID).First(&sharedNote).Error; err != nil {
		c.HTML(http.StatusNotFound, "shared_not_found.html", gin.H{
			"title": "Note Not Found",
		})
		return
	}

	// Check if expired
	if sharedNote.ExpiresAt != nil && sharedNote.ExpiresAt.Before(time.Now()) {
		c.HTML(http.StatusGone, "shared_expired.html", gin.H{
			"title": "Note Expired",
		})
		return
	}

	proto := c.Request.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if c.Request.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := c.Request.Host
	pageURL := fmt.Sprintf("%s://%s/shared/%s", proto, host, shareUUID.String())
	imgURL := fmt.Sprintf("%s://%s/static/og.jpg", proto, host)
	desc := strings.TrimSpace(sharedNote.Note.Content)
	if desc == "" {
		desc = "A shared note from blank.ashref.tn"
	}
	if len(desc) > 180 {
		desc = desc[:180] + "..."
	}

	c.HTML(http.StatusOK, "shared_note.html", gin.H{
		"title":       sharedNote.Note.Title,
		"content":     sharedNote.Note.Content,
		"date":        sharedNote.Note.CreatedAt.Format("January 2, 2006"),
		"url":         pageURL,
		"image":       imgURL,
		"description": desc,
	})
}

func downloadNoteHandler(c *gin.Context) {
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Downloads disabled"})
		return
	}

	noteID := c.Param("id")
	format := c.Param("format")

	noteUUID, err := uuid.Parse(noteID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid note ID"})
		return
	}

	var note Note
	if err := db.Where("id = ?", noteUUID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	filename := note.GetTitle()
	if filename == "Untitled" {
		filename = "note"
	}

	// Sanitize filename
	filename = strings.ReplaceAll(filename, "/", "-")
	filename = strings.ReplaceAll(filename, "\\", "-")
	filename = strings.ReplaceAll(filename, ":", "-")

	switch format {
	case "txt":
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.txt\"", filename))
		c.Header("Content-Type", "text/plain")
		c.String(http.StatusOK, note.Content)
	case "md":
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.md\"", filename))
		c.Header("Content-Type", "text/markdown")
		c.String(http.StatusOK, note.Content)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid format"})
	}
}

func searchNotesHandler(c *gin.Context) {
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Search disabled"})
		return
	}

	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter required"})
		return
	}

	var notes []Note
	searchTerm := "%" + query + "%"
	if err := db.Where("title ILIKE ? OR content ILIKE ?", searchTerm, searchTerm).
		Order("updated_at DESC").Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"notes": notes})
}

func statsHandler(c *gin.Context) {
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"totalNotes": 0, "totalWords": 0, "sharingEnabled": false})
		return
	}
	var totalNotes int64
	var totalWords int64

	db.Model(&Note{}).Count(&totalNotes)

	var notes []Note
	db.Find(&notes)

	for _, note := range notes {
		totalWords += int64(note.WordCount())
	}

	c.JSON(http.StatusOK, gin.H{
		"totalNotes": totalNotes,
		"totalWords": totalWords,
	})
}
