// Feature invites — "come join me at /<feature>". A client sends
// `invite:send` via WS with {feature} and the partner's App-level listener
// raises a sticky toast with a Join button.
//
// Three phrasings per feature:
//   - cta:   button text on the sender's side ("Watch with me")
//   - verb:  receiver's toast says `${name} wants to ${verb}`
//   - label: neutral display name used in titles and fallbacks

export const FEATURE_META = {
  watch:    { to: '/watch',    cta: 'Watch with me',   verb: 'watch something', label: 'Watch party' },
  draw:     { to: '/draw',     cta: 'Draw with me',    verb: 'draw together',   label: 'Drawing' },
  puzzle:   { to: '/puzzle',   cta: 'Puzzle with me',  verb: 'do a puzzle',     label: 'Puzzle' },
  trivia:   { to: '/trivia',   cta: 'Play with me',    verb: 'play trivia',     label: 'Trivia' },
  journal:  { to: '/journal',  cta: 'Write with me',   verb: 'write together',  label: 'Journal' },
  bucket:   { to: '/bucket',   cta: 'Plan with me',    verb: 'plan something',  label: 'Bucket list' },
  music:    { to: '/music',    cta: 'Listen with me',  verb: 'share a song',    label: 'Music' },
  film:     { to: '/film',     cta: 'Add to our roll', verb: 'check the roll',  label: 'Film roll' },
}
