package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var db *gorm.DB

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Initialize database
	initDB()

	// Auto-migrate the schema
	db.AutoMigrate(&Note{}, &SharedNote{})

	// Clean up expired shared notes on startup
	cleanupExpiredNotes()

	// Start background cleanup routine
	go startCleanupRoutine()

	// Initialize Gin router
	r := gin.Default()

	// Load HTML templates
	r.LoadHTMLGlob("templates/*")

	// Serve static files
	r.Static("/static", "./static")

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

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on port %s", port)
	r.Run("0.0.0.0:" + port)
}

func initDB() {
	var err error

	// Get database URL from environment variable
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	log.Println("Database connected successfully")
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

// startCleanupRoutine runs cleanup every 6 hours
func startCleanupRoutine() {
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cleanupExpiredNotes()
		}
	}
}
