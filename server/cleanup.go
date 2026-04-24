package main

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"ldr-server/db"
	"ldr-server/handlers"
)

func startCleanupWorker() {
	go func() {
		// First run after 10 minutes so startup is not burdened.
		time.Sleep(10 * time.Minute)
		runCleanup()

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			runCleanup()
		}
	}()
}

func runCleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	sweepInactiveRooms(ctx)
	sweepFadedSongs(ctx)
	if n, err := handlers.SweepFadedFilms(ctx); err != nil {
		log.Printf("[cleanup] film sweep error: %v", err)
	} else if n > 0 {
		log.Printf("[cleanup] purged %d faded film rolls", n)
	}
}

func sweepInactiveRooms(ctx context.Context) {
	cutoff := time.Now().AddDate(0, 0, -30)

	cursor, err := db.Col("rooms").Find(ctx, bson.M{
		"lastActiveAt": bson.M{"$exists": true, "$lt": cutoff},
	})
	if err != nil {
		log.Printf("[cleanup] query error: %v", err)
		return
	}

	var rooms []struct {
		Code string `bson:"code"`
	}
	if err := cursor.All(ctx, &rooms); err != nil || len(rooms) == 0 {
		return
	}

	for _, r := range rooms {
		for _, col := range []string{"journal", "bucketlist", "trivia", "watchparty", "chat", "puzzle", "milestones", "drawing", "songs", "moods", "messages", "films"} {
			db.Col(col).DeleteMany(ctx, bson.M{"roomId": r.Code})
		}
		handlers.PurgeRoomMedia(r.Code)
		db.Col("rooms").DeleteOne(ctx, bson.M{"code": r.Code})
	}

	log.Printf("[cleanup] deleted %d inactive rooms", len(rooms))
}

// Song letters are meant to be listened to soon. Anything unheard or
// dismissed for more than 7 days fades from the DB so the Inbox stays
// curated. Saved songs are untouched and live until the room itself is
// deleted by the inactive-room sweep.
func sweepFadedSongs(ctx context.Context) {
	cutoff := time.Now().AddDate(0, 0, -7)
	res, err := db.Col("songs").DeleteMany(ctx, bson.M{
		"status":    bson.M{"$in": []string{"unheard", "dismissed"}},
		"createdAt": bson.M{"$lt": cutoff},
	})
	if err != nil {
		log.Printf("[cleanup] songs sweep error: %v", err)
		return
	}
	if res.DeletedCount > 0 {
		log.Printf("[cleanup] faded %d songs", res.DeletedCount)
	}
}
