package handlers

import "ldr-server/ws"

// Package-level hub so HTTP handlers can broadcast WS events directly
// without plumbing the hub through every handler signature.
//
// This makes real-time syncs independent of the caller's own WebSocket
// state — e.g. a partner's journal entry is broadcast by the server
// right after the DB write, even if the sender's own WS is mid-reconnect
// and would otherwise drop a client-initiated broadcast silently.
var Hub *ws.Hub

func SetHub(h *ws.Hub) { Hub = h }
