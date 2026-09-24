// main.go - Local development entry point. Vercel only deploys api/ (Go) and web/dist (static).
package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	handler "blankpage_app/api"

	"github.com/joho/godotenv"
)

const distDir = "web/dist"

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	handler.InitApp()
	router := handler.GetRouter()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if _, err := os.Stat(filepath.Join(distDir, "index.html")); err != nil {
		log.Printf("%s not built: only the API is served. Run `npm run build` in web/, or use `npm run dev` there (proxies /api here).", distDir)
	}

	// Mirrors vercel.json: API routes go to Go, everything else is the built React app.
	static := http.FileServer(http.Dir(distDir))
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/shared/") || p == "/health" {
			router.ServeHTTP(w, r)
			return
		}
		if info, err := os.Stat(filepath.Join(distDir, filepath.Clean(p))); err == nil && !info.IsDir() {
			static.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
	})

	log.Printf("Server starting on http://localhost:%s", port)
	if err := http.ListenAndServe("0.0.0.0:"+port, mux); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
