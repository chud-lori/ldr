package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"ldr-server/db"
	"ldr-server/handlers"
	"ldr-server/ws"
)

func main() {
	_ = godotenv.Load()

	mongoURI := os.Getenv("LDRMONGO")
	if mongoURI == "" {
		mongoURI = os.Getenv("MONGO_URI")
	}
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbName := os.Getenv("MONGO_DB")

	if err := db.Connect(ctx, mongoURI, dbName); err != nil {
		log.Fatal("MongoDB:", err)
	}

	hub := ws.NewHub()
	go hub.Run()
	handlers.SetHub(hub)

	startCleanupWorker()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Route("/api", func(r chi.Router) {
		// Public — no membership required
		r.Post("/rooms", handlers.CreateRoom)
		r.Get("/rooms/{code}", handlers.GetRoom)
		r.Post("/rooms/{code}/join", handlers.JoinRoom)

		// Protected — caller must be a member of the room
		r.Group(func(r chi.Router) {
			r.Use(handlers.RequireMember)

			r.Patch("/rooms/{code}", handlers.UpdateRoom)
			r.Patch("/rooms/{code}/me", handlers.UpdateMe)
			r.Delete("/rooms/{code}", handlers.DeleteRoom)
			r.Put("/rooms/{code}/meetup", handlers.SetMeetup)

			r.Get("/rooms/{code}/journal", handlers.GetJournal)
			r.Get("/rooms/{code}/journal/all", handlers.GetJournalAll)
			r.Post("/rooms/{code}/journal", handlers.SaveJournal)
			r.Post("/rooms/{code}/journal/{date}/{userId}/react", handlers.ReactJournal)
			r.Post("/rooms/{code}/journal/{date}/{userId}/cheer", handlers.CheerJournal)

			r.Get("/rooms/{code}/bucketlist", handlers.GetBucketList)
			r.Post("/rooms/{code}/bucketlist", handlers.AddBucketItem)
			r.Patch("/rooms/{code}/bucketlist/{id}", handlers.UpdateBucketItem)
			r.Delete("/rooms/{code}/bucketlist/{id}", handlers.DeleteBucketItem)

			r.Get("/rooms/{code}/trivia", handlers.GetTrivia)
			r.Post("/rooms/{code}/trivia", handlers.AddTrivia)
			r.Post("/rooms/{code}/trivia/{id}/answer", handlers.AnswerTrivia)
			r.Delete("/rooms/{code}/trivia/{id}", handlers.DeleteTrivia)

			r.Get("/rooms/{code}/watchparty", handlers.GetWatchParty)
			r.Put("/rooms/{code}/watchparty", handlers.SetWatchParty)
			r.Post("/rooms/{code}/watchparty/queue", handlers.AddToQueue)
			r.Delete("/rooms/{code}/watchparty/queue/{index}", handlers.RemoveFromQueue)
			r.Post("/rooms/{code}/watchparty/next", handlers.PlayNext)
			r.Get("/rooms/{code}/chat", handlers.GetChatHistory)
			r.Post("/rooms/{code}/chat", handlers.SendChat)

			r.Get("/rooms/{code}/puzzle", handlers.GetPuzzle)
			r.Post("/rooms/{code}/puzzle", handlers.CreatePuzzle)
			r.Delete("/rooms/{code}/puzzle", handlers.ResetPuzzle)

			r.Get("/rooms/{code}/milestones", handlers.GetMilestones)
			r.Post("/rooms/{code}/milestones", handlers.AddMilestone)
			r.Delete("/rooms/{code}/milestones/{id}", handlers.DeleteMilestone)

			r.Get("/rooms/{code}/drawing", handlers.GetDrawing)
			r.Delete("/rooms/{code}/drawing", handlers.ClearDrawing)

			r.Get("/rooms/{code}/films", handlers.ListFilms)
			r.Post("/rooms/{code}/films/upload", handlers.UploadFilmItem)
			r.Get("/rooms/{code}/films/media/{rollId}/{filename}", handlers.ServeFilmItem)

			r.Get("/rooms/{code}/songs", handlers.ListSongs)
			r.Get("/rooms/{code}/songs/resolve", handlers.ResolveTrack)
			r.Post("/rooms/{code}/songs", handlers.CreateSong)
			r.Patch("/rooms/{code}/songs/{id}", handlers.UpdateSong)
			r.Delete("/rooms/{code}/songs/{id}", handlers.DeleteSong)

			r.Get("/rooms/{code}/moods", handlers.GetMoods)
			r.Put("/rooms/{code}/mood", handlers.SetMood)

			r.Get("/rooms/{code}/messages", handlers.ListMessages)
			r.Post("/rooms/{code}/messages", handlers.CreateMessage)
			r.Post("/rooms/{code}/messages/{id}/read", handlers.ReadMessage)

			r.Get("/rooms/{code}/timeline", handlers.GetTimeline)
		})
	})

	r.Get("/ws/{code}", handlers.WSHandler(hub))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("LDR server :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,X-User-ID")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
