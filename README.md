# blank.ashref.tn - Minimalist Note Taking App

A modern, elegant note-taking application with a local-first approach. Built with Go (Gin) backend and vanilla JavaScript frontend. Features instant local storage for notes with optional cloud sharing via PostgreSQL.

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

- **Frontend**: Vanilla JavaScript with localStorage for instant note management
- **Backend**: Go with Gin web framework (only for sharing functionality)
- **Local Storage**: Browser localStorage for primary note storage
- **Cloud Storage**: PostgreSQL (only for shared notes)
- **Styling**: Tailwind CSS with Cousine font
- **Templates**: Go HTML templates for sharing pages
- **HTTP Requests**: Native Fetch API for sharing functionality

## Prerequisites

- Go 1.18 or higher
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
   go run .
   ```

5. **Access the application**
   Open your browser and navigate to `http://localhost:8080`

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
- `GET /shared/:shareId` - View shared note in browser

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
3. Click "New Note" or use Ctrl+N to create additional notes
4. The first line automatically becomes the note title

### Organizing Notes
- All notes appear in the sidebar, sorted by last modified
- Click any note in the sidebar to switch to it
- Delete notes using the trash icon in the sidebar
- Notes persist between browser sessions via localStorage

### Sharing Notes (Optional)
1. Write your note in the editor
2. Click the "Share" button in the top navigation
3. Choose an expiration time (1 hour, 24 hours, 7 days, 30 days, or never)
4. Click "Create Share Link" to generate a public URL
5. Copy and share the link with others

### Local Storage Benefits
- **Instant saving**: No network delays or loading spinners
- **Offline first**: Works without internet connection
- **Privacy**: Notes stay on your device unless you explicitly share them
- **Performance**: Lightning-fast switching between notes

### Keyboard Shortcuts
- `Ctrl+N` (or `Cmd+N`): Create new note
- `Ctrl+D` (or `Cmd+D`): Toggle dark mode
- `Ctrl+S` (or `Cmd+S`): Manual save (auto-save is always active)
- `Escape`: Close open menus

### Themes
- Click the "🌓 Theme" button to toggle between light and dark mode
- Theme preference is saved in browser localStorage
- Respects system dark mode preference by default

### Sound Effects
- Click the "🔊 Sound" button to toggle typewriter sounds
- Sound preference is saved in browser localStorage

## Development

### Project Structure
```
blankpage_app/
├── api/
│   ├── app.go              # All application logic (handlers, models, routing)
│   ├── templates/          # HTML templates (embedded)
│   │   ├── index.html
│   │   ├── sidebar.html
│   │   └── ...
│   └── static/             # Static assets (embedded)
│       ├── css/style.css
│       └── js/app.js
├── main.go                 # Local development entry point
├── go.mod                  # Go module definition
├── vercel.json             # Vercel deployment config
└── README.md
```

**Note**: All business logic is in `/api/app.go`. The root `main.go` is a thin wrapper for local development that imports from the `api` package. This structure eliminates code duplication while supporting both local development and Vercel deployment.

### Adding Features
1. Add new routes in `/api/app.go` (in `setupRoutes` function)
2. Implement handlers in `/api/app.go`
3. Update models in `/api/app.go`
4. Create templates in `/api/templates/`
5. Add styles to `/api/static/css/style.css`
6. Add JavaScript to `/api/static/js/app.js`

### Database Migrations
The application uses GORM's auto-migration feature. To add new fields:
1. Update the model structs in `/api/app.go`
2. Restart the application
3. GORM will automatically create new columns

## Deployment

### Docker (Recommended)
Create a `Dockerfile`:
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o main .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
# Templates and static files are embedded in the binary
CMD ["./main"]
```

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

