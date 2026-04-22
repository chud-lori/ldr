package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"nhooyr.io/websocket"

	"ldr-server/db"
	"ldr-server/models"
	"ldr-server/ws"
)

func presenceList(hub *ws.Hub, roomID string) []map[string]string {
	clients := hub.RoomClients(roomID)
	seen := make(map[string]bool)
	list := make([]map[string]string, 0, len(clients))
	for _, c := range clients {
		if seen[c.ID] {
			continue
		}
		seen[c.ID] = true
		list = append(list, map[string]string{
			"userId":   c.ID,
			"name":     c.Name,
			"timezone": c.Timezone,
		})
	}
	return list
}

func WSHandler(hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := strings.ToUpper(chi.URLParam(r, "code"))
		uid := r.URL.Query().Get("userId")
		name := r.URL.Query().Get("name")
		tz := r.URL.Query().Get("tz")

		// Verify caller is a member before upgrading to WebSocket.
		{
			ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			ok := isMemberOf(ctx, code, uid)
			cancel()
			if !ok {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			return
		}

		client := &ws.Client{
			ID:       uid,
			Name:     name,
			Timezone: tz,
			RoomID:   code,
			Send:     make(chan []byte, 64),
		}

		// Register blocks until the client is fully in the hub.
		hub.Register(client)

		// Touch lastActiveAt and persist timezone — non-blocking.
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			now := time.Now()
			set := bson.M{"lastActiveAt": now}
			if tz != "" {
				set["members.$.timezone"] = tz
			}
			db.Col("rooms").UpdateOne(ctx,
				bson.M{"code": code, "members.userId": uid},
				bson.M{"$set": set},
			)
		}()

		// Broadcast updated presence list to everyone in the room.
		hub.BroadcastAll(code, ws.MarshalMsg("presence:list", "", "", presenceList(hub, code)))

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// Writer goroutine
		go func() {
			for {
				select {
				case data, ok := <-client.Send:
					if !ok {
						conn.Close(websocket.StatusNormalClosure, "")
						return
					}
					conn.Write(ctx, websocket.MessageText, data)
				case <-ctx.Done():
					return
				}
			}
		}()

		// Reader loop
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				break
			}

			var msg ws.Message
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			msg.UserID = uid
			msg.Name = name
			outData, _ := json.Marshal(msg)

			switch {
			case strings.HasPrefix(msg.Type, "watch:") || strings.HasPrefix(msg.Type, "puzzle:"):
				hub.Broadcast(code, outData, client)
				if msg.Type == "puzzle:move" {
					go handlePuzzleMove(code, msg.Payload)
				}

			case msg.Type == "room:theme":
				hub.Broadcast(code, outData, client)

			case msg.Type == "trivia:answer":
				hub.Broadcast(code, outData, client)

			case msg.Type == "nudge:send":
				hub.Broadcast(code, outData, client)

			case msg.Type == "touch:press",
				msg.Type == "touch:release":
				// Press-and-hold presence. Live only — no DB.
				hub.Broadcast(code, outData, client)

			case msg.Type == "draw:stroke":
				var stroke models.Stroke
				if err := json.Unmarshal(msg.Payload, &stroke); err != nil {
					continue
				}
				stroke.UserID = uid
				stroke.At = time.Now()
				go AppendStroke(code, stroke)
				hub.Broadcast(code, outData, client)

			case msg.Type == "draw:clear":
				go ClearStrokes(code)
				hub.Broadcast(code, outData, client)

			case msg.Type == "queue:changed":
				// Fire-and-forget signal — partner re-fetches the watchparty.
				hub.Broadcast(code, outData, client)

			case msg.Type == "journal:saved":
				// Partner refetches the journal + streak data
				hub.Broadcast(code, outData, client)

			case msg.Type == "invite:send":
				// "come join me at /<feature>" toast + Join button on partner's side
				hub.Broadcast(code, outData, client)

			case msg.Type == "song:heard",
				msg.Type == "song:saved":
				// Music letters — receiver → sender feedback.
				// (`song:sent` is now emitted server-side from CreateSong.)
				hub.Broadcast(code, outData, client)

			case msg.Type == "presence:request":
				data := ws.MarshalMsg("presence:list", "", "", presenceList(hub, code))
				select {
				case client.Send <- data:
				default:
				}

			case msg.Type == "ping":
				// keepalive — no broadcast needed
			}
		}

		// Unregister blocks until fully removed, then broadcast updated list.
		hub.Unregister(client)
		hub.BroadcastAll(code, ws.MarshalMsg("presence:list", "", "", presenceList(hub, code)))
	}
}

func handlePuzzleMove(roomID string, payload json.RawMessage) {
	var move struct {
		PieceID  int `json:"pieceId"`
		CurrentX int `json:"currentX"`
		CurrentY int `json:"currentY"`
	}
	if err := json.Unmarshal(payload, &move); err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var puzzle models.Puzzle
	if err := db.Col("puzzle").FindOne(ctx, bson.M{"roomId": roomID}).Decode(&puzzle); err != nil {
		return
	}

	for i := range puzzle.Pieces {
		if puzzle.Pieces[i].ID == move.PieceID {
			puzzle.Pieces[i].CurrentX = move.CurrentX
			puzzle.Pieces[i].CurrentY = move.CurrentY
			break
		}
	}

	completed := true
	for _, p := range puzzle.Pieces {
		if p.CurrentX != p.CorrectX || p.CurrentY != p.CorrectY {
			completed = false
			break
		}
	}

	UpdatePuzzlePieces(roomID, puzzle.Pieces, completed)
}
