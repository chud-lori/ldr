import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const ToastContext = createContext(null)

const ICONS = { success: '✓', info: 'ℹ', warning: '⚠️', error: '✕' }
const STYLES = {
  success: 'bg-emerald-600 text-white',
  info:    'bg-slate-700 text-white',
  warning: 'bg-amber-500 text-white',
  error:   'bg-red-500 text-white',
}

function ToastItem({ toast, onRemove }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), toast.duration ?? 4000)
    return () => clearTimeout(t)
  }, [toast.id, toast.duration, onRemove])

  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm max-w-xs w-full pointer-events-auto ${STYLES[toast.type] || STYLES.info}`}
      style={{ animation: 'slideIn 0.2s ease' }}>
      <span className="shrink-0 font-bold">{ICONS[toast.type] || ICONS.info}</span>
      <span className="leading-relaxed flex-1">{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 opacity-70 hover:opacity-100 leading-none text-base">×</button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((message, type = 'info', duration) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type, duration }])
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
