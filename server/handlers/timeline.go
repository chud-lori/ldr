package handlers

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"

	"ldr-server/db"
	"ldr-server/models"
)

type TimelineEntry struct {
	Date   time.Time `json:"date"`
	Kind   string    `json:"kind"` // milestone | bucket_done | journal_shared
	Title  string    `json:"title"`
	Detail string    `json:"detail,omitempty"`
}

func GetTimeline(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	out := []TimelineEntry{}
	now := time.Now()

	// Past milestones
	if cursor, err := db.Col("milestones").Find(ctx, bson.M{
		"roomId": code,
		"date":   bson.M{"$lte": now},
	}); err == nil {
		var ms []models.Milestone
		cursor.All(ctx, &ms)
		for _, m := range ms {
			out = append(out, TimelineEntry{
				Date:   m.Date,
				Kind:   "milestone",
				Title:  m.Title,
				Detail: m.Kind,
			})
		}
	}

	// Completed bucket items
	if cursor, err := db.Col("bucketlist").Find(ctx, bson.M{
		"roomId": code,
		"done":   true,
	}); err == nil {
		var items []models.BucketItem
		cursor.All(ctx, &items)
		for _, it := range items {
			d := it.CreatedAt
			if it.DoneAt != nil {
				d = *it.DoneAt
			}
			title := it.Text
			if title == "" && it.Surprise {
				title = "surprise item"
			}
			out = append(out, TimelineEntry{
				Date:  d,
				Kind:  "bucket_done",
				Title: title,
			})
		}
	}

	// Shared journal days — both partners wrote on the same date
	if cursor, err := db.Col("journal").Find(ctx, bson.M{"roomId": code}); err == nil {
		var entries []models.JournalEntry
		cursor.All(ctx, &entries)
		byDate := make(map[string]map[string]bool) // date -> set of userIds
		for _, e := range entries {
			if byDate[e.Date] == nil {
				byDate[e.Date] = map[string]bool{}
			}
			byDate[e.Date][e.UserID] = true
		}
		for date, users := range byDate {
			if len(users) < 2 {
				continue
			}
			t, err := time.Parse("2006-01-02", date)
			if err != nil {
				continue
			}
			out = append(out, TimelineEntry{
				Date:  t,
				Kind:  "journal_shared",
				Title: "Wrote together",
			})
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Date.After(out[j].Date) })

	respond(w, http.StatusOK, out)
}
