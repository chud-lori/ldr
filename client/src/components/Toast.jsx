import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { Check, Info, AlertTriangle, X } from '../lib/icons'

const ToastContext = createContext(null)

const ICONS = { success: Check, info: Info, warning: AlertTriangle, error: X }
const STYLES = {
  success: 'bg-emerald-600 text-white',
  info:    'bg-slate-700 text-white',
  warning: 'bg-amber-500 text-white',
  error:   'bg-red-500 text-white',
}

function ToastItem({ toast, onRemove }) {
  useEffect(() => {
    // Sticky toasts (duration === 0 or null) stay until dismissed or the
    // action is tapped — used for invites that need a partner response.
    if (toast.duration === 0 || toast.duration === null) return
    const t = setTimeout(() => onRemove(toast.id), toast.duration ?? 4000)
    return () => clearTimeout(t)
  }, [toast.id, toast.duration, onRemove])

  const Icon = ICONS[toast.type] || ICONS.info
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm max-w-xs w-full pointer-events-auto ${STYLES[toast.type] || STYLES.info}`}
      style={{ animation: 'slideIn 0.2s ease' }}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2.5} aria-hidden="true" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="leading-relaxed">{toast.message}</div>
        {toast.action && (
          <button
            onClick={() => { toast.action.onClick(); onRemove(toast.id) }}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1 transition-colors"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 opacity-70 hover:opacity-100 p-0.5" aria-label="Dismiss">
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  // Signature: add(message, typeOrOpts, durationOrOpts)
  //   - Legacy: add("text", "success", 4000)
  //   - New:    add("text", "success", { action: { label, onClick }, duration: 0 })
  const add = useCallback((message, type = 'info', opts) => {
    const id = Date.now() + Math.random()
    const config = (typeof opts === 'object' && opts !== null)
      ? { duration: opts.duration, action: opts.action }
      : { duration: opts }
    setToasts((prev) => [...prev, { id, message, type, ...config }])
  }, [])

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: 'calc(100vw - 2rem)' }}>
        {toasts.map((t) => <ToastItem key={t.id} toast={t} onRemove={remove} />)}
      </div>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(1rem) } to { opacity:1; transform:translateX(0) } }`}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
