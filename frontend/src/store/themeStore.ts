import { create } from 'zustand'
import { readStorage, writeStorage } from '@/utils/storage'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'superpos_theme'

function getSystemPreference(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToDocument(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const initialTheme = readStorage<Theme | null>(THEME_KEY, null) ?? getSystemPreference()
applyThemeToDocument(initialTheme)

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyThemeToDocument(theme)
    writeStorage(THEME_KEY, theme)
    set({ theme })
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyThemeToDocument(next)
    writeStorage(THEME_KEY, next)
    set({ theme: next })
  },
}))
