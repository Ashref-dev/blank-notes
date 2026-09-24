# blank.achraf.tn - Minimalist Note Taking App

A modern, elegant note-taking application with a local-first approach. Built with a React 19 frontend (Vite, Tailwind v4, React Compiler) and a Go (Gin) API, both deployed on Vercel. Features instant local storage for notes with optional cloud sharing via PostgreSQL.

## Screenshot

![Blank Note Taking App](shot.jpeg)

## Features

- **Local-First Storage**: Notes saved instantly to browser localStorage - no network delays
- **Minimalist Interface**: Clean, distraction-free writing environment with generous spacing
- **Instant Auto-save**: Notes are saved immediately as you type (no 2-second delays)
- **Note Organization**: Sidebar with all your notes, sorted by last modified
- **Optional Cloud Sharing**: Generate shareable links with configurable expiration times
- **Dark Mode**: Toggle between light and dark themes (saved in localStorage)
- **Download**: Export notes as .txt or .md files
- **Real-time Word Count**: Live word and character counting
- **Responsive Design**: Works perfectly on desktop and mobile devices
- **Keyboard Shortcuts**: Full keyboard navigation support

## Tech Stack

- **Frontend** (`web/`): React 19 + React Compiler, Vite, Tailwind CSS v4, TypeScript. Notes in localStorage, images in IndexedDB.
- **Backend** (`api/app.go`): Go with Gin, deployed as a Vercel serverless function (sharing only).
- **Cloud Storage**: PostgreSQL (only for shared notes)

## Prerequisites

- Go 1.23 or higher
- Node.js 22.12 or higher
- PostgreSQL 12 or higher (only needed for sharing functionality)

## Setup

1. **Clone or extract the project**
   ```bash
   cd blankpage_app
   ```

2. **Install Go dependencies**
   ```bash
   go mod tidy
   ```

3. **Set up PostgreSQL (Optional - only for sharing)**
   
   If you want to use the sharing functionality, create a PostgreSQL database:
   ```sql
   CREATE USER blankpage WITH PASSWORD 'blankpage';
   CREATE DATABASE blankpage OWNER blankpage;
   ```

   Set the DATABASE_URL environment variable:
   ```bash
   export DATABASE_URL="postgres://blankpage:blankpage@localhost:5432/blankpage?sslmode=disable"
   ```

4. **Run the application**
   ```bash
   cd web && npm ci && npm run build && cd ..
   go run .                 # http://localhost:8080 (app + API)
   ```
   For frontend work with hot reload, run `go run .` in one terminal and `cd web && npm run dev` in another (http://localhost:5173, proxies `/api` to Go).

**Note**: The app works perfectly without PostgreSQL - you'll just be unable to share notes publicly. All note-taking functionality works with localStorage only.

## Configuration

### Environment Variables

- `PORT`: Server port (default: 8080)
- `DATABASE_URL`: PostgreSQL connection string (optional, only for sharing)

### Local Storage

The app uses browser localStorage with the key `blankpage_notes` to store all your notes locally. Notes are structured as:

```javascript
{
  "note_1234567890_abc123": {
    "id": "note_1234567890_abc123",
    "title": "Auto-generated from first line",
    "content": "Your note content here...",
    "createdAt": "2025-07-26T10:30:00.000Z",
    "updatedAt": "2025-07-26T10:35:00.000Z"
  }
}
```

## API Endpoints

### Core Application
- `GET /` - Main application (serves the note-taking interface)
- `GET /health` - Health check endpoint

### Sharing API (Optional - requires PostgreSQL)
- `POST /api/share` - Create a shareable link from local note
- `GET /api/shared/:shareId` - Shared note as JSON
- `GET /shared/:shareId` - View shared note in browser (with per-note Open Graph / Twitter meta)
- `GET /api/og/:shareId.png` - Dynamic 1200×630 link-preview image for a shared note (`/api/og/site.png` for the site card)

**Note**: All note CRUD operations happen locally in the browser. The backend is only used for sharing functionality.

## Database Schema

**Note**: Database is only used for shared notes. All personal notes are stored in browser localStorage.

### Notes Table (for sharing only)
```sql
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Shared Notes Table
```sql
CREATE TABLE shared_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);
```

## Usage

### Creating Notes
1. Start typing immediately in the main editor area
2. Notes are saved instantly to localStorage as you type
3. Click "+" or press ⌃⌥N / Ctrl+Alt+N to create additional notes
4. The first line automatically becomes the note title

### Organizing Notes
- All notes appear in the sidebar, sorted by last modified
- Click any note in the sidebar to switch to it
- Delete notes using the trash icon in the sidebar
- Notes persist between browser sessions via localStorage

### Sharing Notes (Optional)
1. Write your note in the editor
2. Click the "Share" button in the top navigation
3. Choose an expiration (1 hour, 1 day, 1 week, 1 month, a custom date, or never)
4. Click "Create link" — it's copied to your clipboard

### Local Storage Benefits
- **Instant saving**: No network delays or loading spinners
- **Offline first**: Works without internet connection
- **Privacy**: Notes stay on your device unless you explicitly share them
- **Performance**: Lightning-fast switching between notes

### Keyboard Shortcuts
App shortcuts use `⌃⌥` (Control+Option) on macOS and `Ctrl+Alt` elsewhere, so they never type accent characters.
- `⌘K` / `Ctrl+K`: Command bar (every action: share, copy, export, import, backup, print, theme…)
- `⌃⌥N`: New note
- `⌃⌥B`: Toggle sidebar (or click the sidebar's edge)
- `⌃⌥F`: Focus mode (`Esc` to exit)
- `⌃⌥S`: Share the current note
- `⌃⌥T`: Toggle light/dark theme
- `/`: Search notes

### Images
Paste or drop images anywhere to attach them to the current note. They're stored in this browser (IndexedDB) and aren't included in share links.

## Development

### Project Structure
```
blankpage_app/
├── api/app.go              # All Go logic (sharing API, shared-note link previews) — Vercel function
├── web/                    # React app → web/dist (served statically by Vercel)
│   ├── index.html
│   ├── public/static/      # favicon, og.jpg
│   └── src/
├── og/                     # Link-preview (Open Graph) image renderer, fonts embedded
├── main.go                 # Local development entry point (serves web/dist + API)
├── go.mod
└── vercel.json             # Builds web/, routes /api, /shared, /health to Go
```

### Database Migrations
The application uses GORM's auto-migration feature. To add new fields:
1. Update the model structs in `/api/app.go`
2. Restart the application
3. GORM will automatically create new columns

## Deployment

### Vercel
`vercel.json` builds `web/` (`npm ci && npm run build`) and deploys `api/app.go` as a Go function. Set `DATABASE_URL` in the project settings to enable sharing.

### Docker
`docker build -t blank . && docker run -p 8080:8080 -e DATABASE_URL=... blank` — the image builds the frontend and the Go server.

### Environment Variables for Production
```bash
export PORT=8080
export DATABASE_URL="postgres://user:password@host:port/dbname?sslmode=require"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Support

For issues and questions, please create an issue in the project repository.

