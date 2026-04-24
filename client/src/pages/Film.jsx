import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { Camera, Lock, Download, AlertTriangle, Paperclip } from '../lib/icons'
import { compressPhoto } from '../lib/media'
import InviteButton from '../components/InviteButton'

const MAX_VIDEO_SECONDS = 30

async function probeVideoDuration(file) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    return await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve(video.duration)
      video.onerror = () => reject(new Error('cannot read video'))
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function FilmPage({ ws, online }) {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const uid = store.get('userId')

  const [rolls, setRolls] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/rooms/${code}/films`)
      setRolls(Array.isArray(data) ? data : [])
    } catch {}
  }, [code])

  useEffect(() => { load() }, [load])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking same file
    if (!file) return
    setError('')
    setUploading(true)
    try {
      let toUpload = file
      if (file.type.startsWith('image/')) {
        toUpload = await compressPhoto(file)
      } else if (file.type.startsWith('video/')) {
        const duration = await probeVideoDuration(file)
        if (duration > MAX_VIDEO_SECONDS) {
          setError(`Video too long — keep it under ${MAX_VIDEO_SECONDS}s.`)
          return
        }
      } else {
        setError('Unsupported file type — pick a photo or short video.')
        return
      }
      const fd = new FormData()
      fd.append('file', toUpload)
      const res = await fetch(`/api/rooms/${code}/films/upload`, {
        method: 'POST',
        headers: { 'X-User-ID': uid },
        body: fd,
      })
      if (!res.ok) {
        setError(await res.text() || 'Upload failed')
        return
      }
      await load()
    } catch (err) {
      setError(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-slate-800 inline-flex items-center gap-2">
          <Camera className="h-5 w-5 text-slate-500" strokeWidth={2} aria-hidden="true" />
          Film Roll
        </h2>
        <InviteButton ws={ws} online={online} feature="film" selfId={uid} />
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
        {uploading ? (
          <div className={`w-full text-center ${t.btn} rounded-xl py-3 text-sm font-semibold opacity-50`}>
            Uploading…
          </div>
        ) : (
          <div className="flex gap-2">
            <label
              className={`flex-1 flex items-center justify-center gap-1.5 cursor-pointer ${t.btn} rounded-xl py-3 text-sm font-semibold`}
              data-testid="film-capture-label"
            >
              <Camera className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Take
              <input
                type="file"
                accept="image/*,video/*"
                capture="environment"
                onChange={handleFile}
                className="hidden"
                data-testid="film-capture-input"
              />
            </label>
            <label
              className="flex-1 flex items-center justify-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3 text-sm font-semibold"
              data-testid="film-upload-label"
            >
              <Paperclip className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Choose
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFile}
                className="hidden"
                data-testid="film-upload-input"
              />
            </label>
          </div>
        )}
        {error && (
          <div className="text-xs text-red-500 inline-flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={2} />
            <span className="flex-1">{error}</span>
          </div>
        )}
        <p className="text-[11px] text-slate-400 text-center leading-relaxed">
          Photos auto-resize. Videos must be ≤ {MAX_VIDEO_SECONDS}s and 50&nbsp;MB.
          Each weekly roll develops Monday and fades 7 days later — save the keepers.
        </p>
      </div>

      {rolls.map((roll) => (
        <RollCard key={roll.id} roll={roll} code={code} uid={uid} t={t} />
      ))}

      {rolls.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className={`mx-auto mb-3 h-14 w-14 rounded-2xl ${t.accentBg} ${t.accent} flex items-center justify-center`}>
            <Camera className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </div>
          <p className="text-slate-500 font-medium">No rolls yet</p>
          <p className="text-slate-400 text-sm mt-1">Upload a photo or short video to start this week.</p>
        </div>
      )}
    </div>
  )
}

function RollCard({ roll, code, uid, t }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(i)
  }, [])

  const developAt = new Date(roll.developAt).getTime()
  const purgeAt = new Date(roll.purgeAt).getTime()
  const developing = !roll.developed
  const fading = roll.developed && purgeAt - now < 86400000 * 2

  const countdown = (target) => {
    const ms = target - now
    if (ms <= 0) return null
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    if (d > 0) return `${d}d ${h}h`
    const m = Math.floor((ms % 3600000) / 60000)
    return `${h}h ${m}m`
  }

  const itemUrl = (item) => `/api/rooms/${code}/films/media/${roll.id}/${item.filename}`

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-700 text-sm">{roll.period}</h3>
        {developing ? (
          <span className="text-xs text-amber-600 inline-flex items-center gap-1">
            <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Develops in {countdown(developAt)}
          </span>
        ) : fading ? (
          <span className="text-xs text-rose-500">Fades in {countdown(purgeAt)}</span>
        ) : (
          <span className="text-xs text-emerald-600">Developed</span>
        )}
      </div>

      {developing && roll.partnerHas > 0 && (
        <p className="text-xs text-slate-400 italic">
          Partner has added {roll.partnerHas} item{roll.partnerHas !== 1 ? 's' : ''} (hidden until develop)
        </p>
      )}

      {roll.items.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {roll.items.map((item) => (
            <div key={item.id} className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden group">
              {item.kind === 'photo' ? (
                <img
                  src={itemUrl(item)}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={itemUrl(item)}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full h-full object-cover bg-black"
                />
              )}
              {item.userId === uid && (
                <span className="absolute top-1 left-1 text-[10px] bg-white/80 text-slate-600 rounded px-1.5 py-0.5">
                  yours
                </span>
              )}
              <a
                href={itemUrl(item)}
                download={item.filename}
                className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Save to device"
                aria-label="Save to device"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">Empty so far this week</p>
      )}
    </div>
  )
}
