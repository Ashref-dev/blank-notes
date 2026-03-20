package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	handler "blankpage_app/api"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	handler.InitApp()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	
	router := handler.GetRouter()
	if err := http.ListenAndServe("0.0.0.0:"+port, router); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
