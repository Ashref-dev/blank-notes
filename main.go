package main

import (
	"embed"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:embed templates/*.html static/* static/css/* static/js/* static/favicon/*
var embeddedFS embed.FS

var db *gorm.DB

func main() {
	// Only run the traditional server when executing binary (not on Vercel function)
	startServer()
}

func startServer() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}
	initDBOptional()
	if db != nil {
		// Auto-migrate the schema
		db.AutoMigrate(&Note{}, &SharedNote{})

		// Clean up expired shared notes on startup
		cleanupExpiredNotes()
	}

	// Initialize Gin router
	r := NewRouter()

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on port %s", port)
	r.Run("0.0.0.0:" + port)
}

// NewRouter creates the Gin engine (used by both serverless and local run)
func NewRouter() *gin.Engine {
	r := gin.Default()

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

	// Routes
	setupRoutes(r)

	return r
}

func initDBOptional() {
	// Get database URL from environment variable
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set - running in no-share mode")
		return
	}

	// Connect to the database
	connection, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Printf("Failed to connect database: %v (sharing disabled)", err)
		return
	}
	db = connection
	log.Println("Database connected - sharing enabled")
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
