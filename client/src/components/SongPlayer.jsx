import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCw } from '../lib/icons'

// Unified play/pause-only shell for YouTube and Spotify tracks.
//
// The underlying iframe is mounted off-screen because we only want audio
// and a pair of controls — not the embed's native chrome. For YouTube we
// poll position; Spotify pushes `playback_update` events directly.
//
// onEnded fires once per track the first time the track reaches its end.
export default function SongPlayer({ provider, trackId, onEnded, autoPlay = true }) {
  const mountRef = useRef(null)
  const playerRef = useRef(null)
  const endedFiredRef = useRef(false)
  const pollRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    endedFiredRef.current = false
    setPlaying(false)
    setProgress(0)
    setEnded(false)
    setReady(false)
  }, [trackId, provider])

  useEffect(() => {
    if (!trackId) return
    let cancelled = false

    const fireEnded = () => {
      if (endedFiredRef.current) return
      endedFiredRef.current = true
      setEnded(true)
      onEnded?.()
    }

    if (provider === 'youtube') {
      const setup = () => {
        if (cancelled || !window.YT?.Player || !mountRef.current) return
        playerRef.current = new window.YT.Player(mountRef.current, {
          height: '1',
          width: '1',
          videoId: trackId,
          playerVars: {
            playsinline: 1, rel: 0, modestbranding: 1,
            controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
          },
          events: {
            onReady: () => {
              setReady(true)
              if (autoPlay) {
                try { playerRef.current.playVideo() } catch {}
              }
              pollRef.current = setInterval(() => {
                const p = playerRef.current
                if (!p?.getDuration) return
                const d = p.getDuration()
                if (d > 0) setProgress(Math.min(1, p.getCurrentTime() / d))
              }, 300)
            },
            onStateChange: (e) => {
              const PS = window.YT?.PlayerState
              if (!PS) return
              if (e.data === PS.PLAYING) { setPlaying(true); setEnded(false) }
              else if (e.data === PS.PAUSED) setPlaying(false)
              else if (e.data === PS.ENDED) {
                setPlaying(false)
                setProgress(1)
                fireEnded()
              }
            },
          },
        })
      }
      if (window.YT?.Player) setup()
      else {
        const prev = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => { prev?.(); setup() }
        if (!document.getElementById('yt-api')) {
          const s = document.createElement('script')
          s.id = 'yt-api'; s.src = 'https://www.youtube.com/iframe_api'
          document.head.appendChild(s)
        }
      }
      return () => {
        cancelled = true
        if (pollRef.current) clearInterval(pollRef.current)
        try { playerRef.current?.destroy?.() } catch {}
        playerRef.current = null
      }
    }

    if (provider === 'spotify') {
      const setup = () => {
        if (cancelled || !window.SpotifyIFrameAPI || !mountRef.current) return
        window.SpotifyIFrameAPI.createController(
          mountRef.current,
          { uri: `spotify:track:${trackId}`, width: '100%', height: 80 },
          (ctl) => {
            if (cancelled) { try { ctl.destroy() } catch {} ; return }
            playerRef.current = ctl
            ctl.addListener('ready', () => {
              setReady(true)
              if (autoPlay) { try { ctl.play() } catch {} }
            })
            ctl.addListener('playback_update', (ev) => {
              const d = ev?.data
              if (!d) return
              setPlaying(!d.isPaused)
              if (d.duration > 0) setProgress(Math.min(1, d.position / d.duration))
              // Spotify sends isPaused=true + position near duration when the
              // track (or 30-second preview for non-Premium) finishes.
              if (d.duration > 0 && d.position >= d.duration - 400 && d.isPaused) {
                fireEnded()
              }
            })
          }
        )
      }
      if (window.SpotifyIFrameAPI) setup()
      else {
        const prev = window.onSpotifyIframeApiReady
        window.onSpotifyIframeApiReady = (IFrameAPI) => {
          window.SpotifyIFrameAPI = IFrameAPI
          prev?.(IFrameAPI); setup()
        }
        if (!document.getElementById('spotify-iframe-api')) {
          const s = document.createElement('script')
          s.id = 'spotify-iframe-api'
          s.src = 'https://open.spotify.com/embed/iframe-api/v1'
          s.async = true
          document.head.appendChild(s)
        }
      }
      return () => {
        cancelled = true
        try { playerRef.current?.destroy?.() } catch {}
        playerRef.current = null
      }
    }
  }, [provider, trackId, autoPlay, onEnded])

  function togglePlay() {
    const p = playerRef.current
    if (!p) return
    if (ended) {
      if (provider === 'youtube') { p.seekTo(0, true); p.playVideo() }
      else { p.seek?.(0); p.play?.() }
      setEnded(false)
      endedFiredRef.current = false
      return
    }
    if (provider === 'youtube') {
      playing ? p.pauseVideo() : p.playVideo()
    } else {
      p.togglePlay?.()
    }
  }

  const MainIcon = ended ? RotateCw : (playing ? Pause : Play)
  const label = ended ? 'Play again' : (playing ? 'Pause' : 'Play')

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={!ready}
          aria-label={label}
          data-testid="song-play-toggle"
          className="h-12 w-12 rounded-full bg-slate-800 text-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-900 transition-colors"
        >
          <MainIcon className={`h-5 w-5 ${!playing && !ended ? 'ml-0.5' : ''}`} strokeWidth={2.5} />
        </button>
        <div className="flex-1">
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-slate-700 transition-[width]"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
          {!ready && (
            <div className="text-[11px] text-slate-400 mt-1">loading…</div>
          )}
        </div>
      </div>

      {/* Hidden iframe host — audio plays without the native chrome. */}
      <div className="absolute opacity-0 pointer-events-none -z-10" style={{ width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
        <div ref={mountRef} />
      </div>
    </div>
  )
}
