// Feature invites — "come join me at /<feature>". A client sends
// `invite:send` via WS with {feature} and the partner's App-level listener
// raises a sticky toast with a Join button.
//
// Single source of truth for the route + display name + verb used in the
// invite message. Keeps the toast language consistent across features.

export const FEATURE_META = {
  watch:    { to: '/watch',    verb: 'watch something',  label: 'Watch party' },
  draw:     { to: '/draw',     verb: 'draw together',    label: 'Drawing' },
  puzzle:   { to: '/puzzle',   verb: 'do a puzzle',      label: 'Puzzle' },
  trivia:   { to: '/trivia',   verb: 'play trivia',      label: 'Trivia' },
  journal:  { to: '/journal',  verb: 'write together',   label: 'Journal' },
  bucket:   { to: '/bucket',   verb: 'plan something',   label: 'Bucket list' },
  music:    { to: '/music',    verb: 'share a song',     label: 'Music' },
}
