package main

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"ldr-server/db"
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
	cutoff := time.Now().AddDate(0, 0, -30)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

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
		for _, col := range []string{"journal", "bucketlist", "trivia", "watchparty", "chat", "puzzle", "milestones", "drawing"} {
			db.Col(col).DeleteMany(ctx, bson.M{"roomId": r.Code})
		}
		db.Col("rooms").DeleteOne(ctx, bson.M{"code": r.Code})
	}

	log.Printf("[cleanup] deleted %d inactive rooms", len(rooms))
}
