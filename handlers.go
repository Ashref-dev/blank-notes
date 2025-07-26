package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

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

// Share note handler for local storage notes
func shareNoteHandler(c *gin.Context) {
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

	shareURL := fmt.Sprintf("%s://%s/shared/%s",
		c.Request.Header.Get("X-Forwarded-Proto"),
		c.Request.Host,
		shareID.String())

	if shareURL[:4] != "http" {
		shareURL = "http://" + c.Request.Host + "/shared/" + shareID.String()
	}

	response := ShareResponse{
		ShareID:   shareID.String(),
		ShareURL:  shareURL,
		ExpiresAt: expiresAt,
	}

	c.JSON(http.StatusOK, response)
}

// Get shared note handler
func getSharedNoteHandler(c *gin.Context) {
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

	c.HTML(http.StatusOK, "shared_note.html", gin.H{
		"title":   sharedNote.Note.Title,
		"content": sharedNote.Note.Content,
		"date":    sharedNote.Note.CreatedAt.Format("January 2, 2006"),
	})
}

// Handlers
func indexHandler(c *gin.Context) {
	c.HTML(http.StatusOK, "index.html", gin.H{
		"title": "Blank.page",
	})
}

func downloadNoteHandler(c *gin.Context) {
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
