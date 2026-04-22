package handlers

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"

	"ldr-server/db"
	"ldr-server/models"
)

// memberNames returns a uid → display-name map for the given room.
// GET handlers use this to refresh denormalized `name` fields on the way
// out (journal, trivia, chat, songs, bucketlist). That means a rename in
// Settings propagates everywhere without a background migration: stored
// `name` stays as a harmless fallback and the live value wins at read.
func memberNames(ctx context.Context, code string) map[string]string {
	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		return nil
	}
	out := make(map[string]string, len(room.Members))
	for _, m := range room.Members {
		out[m.UserID] = m.Name
	}
	return out
}

// freshName prefers the live member name, falling back to whatever was
// written at the time the row was created.
func freshName(m map[string]string, userID, stored string) string {
	if m != nil {
		if live, ok := m[userID]; ok && live != "" {
			return live
		}
	}
	return stored
}
