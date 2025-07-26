-- Database initialization script for Blank.page application
-- This script sets up the database with proper extensions and initial configuration

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a default user for demo purposes (in production, this would be handled by authentication)
INSERT INTO users (id, username, email, password, created_at, updated_at) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'demo',
    'demo@blankpage.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: "password"
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_notes_note_id ON shared_notes(note_id);
CREATE INDEX IF NOT EXISTS idx_shared_notes_expires_at ON shared_notes(expires_at);

-- Create a sample note for the demo user
INSERT INTO notes (id, user_id, title, content, created_at, updated_at)
VALUES (
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000001',
    'Welcome to Blank.page',
    'This is your first note! Start typing to create more notes.

Features:
- Auto-save as you type
- Dark/light theme toggle
- Share notes with others
- Download as .txt or .md
- Real-time word count

Enjoy your minimalist note-taking experience!',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

