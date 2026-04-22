import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { PuzzleIcon, Sparkles } from '../lib/icons'
import InviteButton from '../components/InviteButton'

export default function Puzzle({ ws, online }) {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const uid = store.get('userId')

  const [puzzle, setPuzzle] = useState(null)
  const [imageUrl, setImageUrl] = useState('')
  const [gridSize, setGridSize] = useState(4)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [completed, setCompleted] = useState(false)

  async function load() {
    const data = await api.get(`/rooms/${code}/puzzle`)
    setPuzzle(data)
    if (data?.completed) setCompleted(true)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!ws) return
    const off = ws.on('puzzle:move', (msg) => {
      setPuzzle((prev) => {
        if (!prev) return prev
        const pieces = prev.pieces.map((p) =>
          p.id === msg.payload.pieceId
            ? { ...p, currentX: msg.payload.currentX, currentY: msg.payload.currentY }
            : p
        )
        const done = pieces.every((p) => p.currentX === p.correctX && p.currentY === p.correctY)
        if (done) setCompleted(true)
        return { ...prev, pieces, completed: done }
      })
    })
    const offReset = ws.on('puzzle:reset', () => {
      setPuzzle(null)
      setCompleted(false)
      setSelected(null)
    })
    return () => { off(); offReset() }
  }, [ws])

  async function createPuzzle(e) {
    e.preventDefault()
    if (!imageUrl.trim()) return
    setCreating(true)
    const data = await api.post(`/rooms/${code}/puzzle`, { imageUrl, gridSize })
    setPuzzle(data)
    setCompleted(false)
    setSelected(null)
    ws?.send('puzzle:reset', {})
    setCreating(false)
  }

  async function resetPuzzle() {
    await api.del(`/rooms/${code}/puzzle`)
    setPuzzle(null)
    setCompleted(false)
    setSelected(null)
    ws?.send('puzzle:reset', {})
  }

  function handlePieceClick(piece) {
    if (completed) return
    if (selected === null) { setSelected(piece.id); return }
    if (selected === piece.id) { setSelected(null); return }

    const sel = puzzle.pieces.find((p) => p.id === selected)
    const newPieces = puzzle.pieces.map((p) => {
      if (p.id === selected) return { ...p, currentX: piece.currentX, currentY: piece.currentY }
      if (p.id === piece.id) return { ...p, currentX: sel.currentX, currentY: sel.currentY }
      return p
    })
    const done = newPieces.every((p) => p.currentX === p.correctX && p.currentY === p.correctY)
    setPuzzle({ ...puzzle, pieces: newPieces, completed: done })
    if (done) setCompleted(true)

    ws?.send('puzzle:move', { pieceId: selected, currentX: piece.currentX, currentY: piece.currentY })
    ws?.send('puzzle:move', { pieceId: piece.id, currentX: sel.currentX, currentY: sel.currentY })
    setSelected(null)
  }

  function renderGrid() {
    if (!puzzle) return null
    const { pieces, gridSize: gs, imageUrl: img } = puzzle
    const cellSize = Math.min(300, (window.innerWidth - 80)) / gs

    const grid = Array(gs).fill(null).map(() => Array(gs).fill(null))
    pieces.forEach((p) => { grid[p.currentY][p.currentX] = p })

    return (
      <div className="flex flex-col items-center gap-1">
        {grid.map((row, y) => (
          <div key={y} className="flex gap-1">
            {row.map((piece, x) => {
              if (!piece) return <div key={x} style={{ width: cellSize, height: cellSize }} className="bg-slate-100 rounded" />
              const isCorrect = piece.currentX === piece.correctX && piece.currentY === piece.correctY
              const isSelected = selected === piece.id
              return (
                <div
                  key={piece.id}
                  onClick={() => handlePieceClick(piece)}
                  style={{
                    width: cellSize, height: cellSize,
                    backgroundImage: `url(${img})`,
                    backgroundSize: `${gs * cellSize}px ${gs * cellSize}px`,
                    backgroundPosition: `${-(piece.correctX * cellSize)}px ${-(piece.correctY * cellSize)}px`,
                    cursor: completed ? 'default' : 'pointer',
                    touchAction: 'manipulation',
                  }}
                  className={`rounded transition-all border-2 ${
                    isSelected ? 'border-amber-400 scale-95 shadow-lg z-10 relative'
                    : isCorrect ? 'border-emerald-400'
                    : 'border-transparent hover:border-slate-300'
                  }`}
                />
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  if (!puzzle) return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-slate-800 inline-flex items-center gap-2">
            <PuzzleIcon className="h-5 w-5 text-slate-500" strokeWidth={2} aria-hidden="true" />
            Collaborative Puzzle
          </h2>
          <InviteButton ws={ws} online={online} feature="puzzle" selfId={uid} />
        </div>
        <p className="text-xs text-slate-400 mb-4">Both of you solve the same puzzle in real-time</p>
        <form onSubmit={createPuzzle} className="space-y-3">
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            placeholder="Image URL (direct link to a photo)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            required
          />
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 font-medium">Grid size:</span>
            {[3, 4, 5].map((n) => (
              <button type="button" key={n} onClick={() => setGridSize(n)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  gridSize === n ? `${t.btn}` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {n}×{n}
              </button>
            ))}
          </div>
          <button type="submit" disabled={creating || !imageUrl.trim()}
            className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50`}>
            {creating ? 'Creating…' : 'Start Puzzle'}
          </button>
        </form>
      </div>

      <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className={`mx-auto mb-3 h-14 w-14 rounded-2xl ${t.accentBg} ${t.accent} flex items-center justify-center`}>
          <PuzzleIcon className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <p className="text-slate-500 font-medium">No puzzle started yet</p>
        <p className="text-slate-400 text-sm mt-1">Create one above to play together</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center justify-between w-full">
            <h2 className="font-bold text-slate-800 inline-flex items-center gap-2">
              <PuzzleIcon className="h-5 w-5 text-slate-500" strokeWidth={2} aria-hidden="true" />
              Puzzle
            </h2>
            <InviteButton ws={ws} online={online} feature="puzzle" selfId={uid} />
          </div>
          <button onClick={resetPuzzle} className="text-xs text-slate-400 hover:text-red-400 transition-colors">
            New puzzle
          </button>
        </div>

        {completed ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-2 h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <Sparkles className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
            </div>
            <p className={`font-bold ${t.accent} text-lg`}>Puzzle Complete!</p>
            <p className="text-slate-500 text-sm mt-1">You solved it together!</p>
            <div className="mt-4">{renderGrid()}</div>
            <button onClick={resetPuzzle}
              className={`mt-5 ${t.btn} rounded-xl px-6 py-2.5 text-sm font-semibold`}>
              New Puzzle
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-400 mb-4">
              Tap a piece to select it, tap another to swap. Work together!
            </p>
            {renderGrid()}
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {puzzle.pieces.filter((p) => p.currentX === p.correctX && p.currentY === p.correctY).length}
                /{puzzle.pieces.length} pieces in place
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 border-2 border-emerald-400 rounded" /> correct</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 border-2 border-amber-400 rounded" /> selected</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
