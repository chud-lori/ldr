import { createContext, useContext, useState, useCallback } from 'react'
import { THEMES, DEFAULT_THEME } from '../lib/themes'
import { store } from '../lib/store'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(() => store.get('theme') || DEFAULT_THEME)

  const setTheme = useCallback((key) => {
    if (!THEMES[key]) return
    store.set('theme', key)
    setThemeKey(key)
  }, [])

  const t = THEMES[themeKey] || THEMES[DEFAULT_THEME]

  return (
    <ThemeContext.Provider value={{ t, themeKey, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
