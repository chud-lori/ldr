import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'

const COLORS = ['#111827', '#ef4444', '#ec4899', '#3b82f6', '#10b981', '#f59e0b']
const WIDTHS = [2, 4, 8]

export default function Draw({ ws }) {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const currentRef = useRef(null)
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [clearing, setClearing] = useState(false)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width: cw, height: ch } = canvas
    ctx.clearRect(0, 0, cw, ch)
    const draw = (s) => {
      if (!s.points || s.points.length === 0) return
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      s.points.forEach((p, i) => {
        const x = p[0] * cw
        const y = p[1] * ch
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    strokesRef.current.forEach(draw)
    if (currentRef.current) draw(currentRef.current)
  }, [])

  // Resize canvas to match its rendered CSS size (high-DPI aware)
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // After setTransform, draw as if in CSS pixels. But render() uses raw canvas.width/height
    // — simplest fix: reset transform to identity and let render use raw pixel coords.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    render()
  }, [render])

  useEffect(() => {
    resize()
    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [resize])

  // Initial fetch of persisted strokes
  useEffect(() => {
    api.get(`/rooms/${code}/drawing`).then((d) => {
      strokesRef.current = Array.isArray(d?.strokes) ? d.strokes : []
      render()
    }).catch(() => {})
  }, [code, render])

  // WS subscriptions
  useEffect(() => {
    if (!ws) return
    const offStroke = ws.on('draw:stroke', (msg) => {
      const s = msg.payload
      if (!s) return
      strokesRef.current.push({ ...s, userId: msg.userId })
      render()
    })
    const offClear = ws.on('draw:clear', () => {
      strokesRef.current = []
      currentRef.current = null
      render()
    })
    return () => { offStroke(); offClear() }
  }, [ws, render])

  function pointFromEvent(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null) return null
    // Normalize to 0..1 relative to displayed canvas
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height]
  }

  function onPointerDown(e) {
    const p = pointFromEvent(e)
    if (!p) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    currentRef.current = { color, width, points: [p] }
    render()
  }

  function onPointerMove(e) {
    if (!currentRef.current) return
    const p = pointFromEvent(e)
    if (!p) return
    currentRef.current.points.push(p)
    render()
  }

  function onPointerUp() {
    const stroke = currentRef.current
    currentRef.current = null
    if (!stroke || stroke.points.length === 0) return
    strokesRef.current.push(stroke)
    render()
    ws?.send('draw:stroke', {
      color: stroke.color,
      width: stroke.width,
      points: stroke.points,
    })
  }

  async function clear() {
    if (clearing) return
    setClearing(true)
    try {
      await api.del(`/rooms/${code}/drawing`)
      strokesRef.current = []
      currentRef.current = null
      render()
      ws?.send('draw:clear', {})
    } catch {}
    setClearing(false)
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-slate-700 scale-110' : 'border-white'}`}
              style={{ backgroundColor: c }}
              data-testid={`color-${c}`}
              title={c}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          {WIDTHS.map((wv) => (
            <button
              key={wv}
              onClick={() => setWidth(wv)}
              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${width === wv ? 'border-slate-700' : 'border-slate-200'}`}
              title={`${wv}px`}
              data-testid={`width-${wv}`}
            >
              <span className="rounded-full bg-slate-700" style={{ width: wv + 2, height: wv + 2 }} />
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={clear}
          disabled={clearing}
          data-testid="clear-canvas"
          className="text-xs font-semibold text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          Clear canvas
        </button>
      </div>

      <div className={`bg-white rounded-2xl shadow-sm border ${t.card} overflow-hidden`}>
        <canvas
          ref={canvasRef}
          data-testid="draw-canvas"
          className="block w-full h-[60vh] touch-none cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      <p className="text-xs text-slate-400 text-center">
        ✏️ Draw together — strokes sync in real time
      </p>
    </div>
  )
}
