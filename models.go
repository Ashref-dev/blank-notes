package main

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Note: Users are not needed for this local-first app. Notes are only stored in the backend for sharing purposes.
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
