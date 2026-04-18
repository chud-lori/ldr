package ws

import (
	"encoding/json"
	"sync"
)

type Client struct {
	ID     string
	Name   string
	RoomID string
	Send   chan []byte
}

type Message struct {
	Type    string          `json:"type"`
	UserID  string          `json:"userId"`
	Name    string          `json:"name,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

type RoomMessage struct {
	RoomID string
	Data   []byte
	Sender *Client
}

type Hub struct {
	rooms      map[string]map[*Client]bool
	mu         sync.RWMutex
	register   chan *Client
	unregister chan *Client
	broadcast  chan *RoomMessage
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
		broadcast:  make(chan *RoomMessage, 128),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			if h.rooms[c.RoomID] == nil {
				h.rooms[c.RoomID] = make(map[*Client]bool)
			}
			h.rooms[c.RoomID][c] = true
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if room, ok := h.rooms[c.RoomID]; ok {
				if _, ok := room[c]; ok {
					delete(room, c)
					close(c.Send)
					if len(room) == 0 {
						delete(h.rooms, c.RoomID)
					}
				}
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.mu.RLock()
			for c := range h.rooms[msg.RoomID] {
				if c == msg.Sender {
					continue
				}
				select {
				case c.Send <- msg.Data:
				default:
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Register(c *Client)   { h.register <- c }
func (h *Hub) Unregister(c *Client) { h.unregister <- c }

func (h *Hub) Broadcast(roomID string, data []byte, sender *Client) {
	h.broadcast <- &RoomMessage{RoomID: roomID, Data: data, Sender: sender}
}

func (h *Hub) BroadcastAll(roomID string, data []byte) {
	h.broadcast <- &RoomMessage{RoomID: roomID, Data: data}
}

func (h *Hub) RoomClients(roomID string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var out []*Client
	for c := range h.rooms[roomID] {
		out = append(out, c)
	}
	return out
}

func MarshalMsg(msgType, userID, name string, payload any) []byte {
	p, _ := json.Marshal(payload)
	data, _ := json.Marshal(Message{Type: msgType, UserID: userID, Name: name, Payload: p})
	return data
}
