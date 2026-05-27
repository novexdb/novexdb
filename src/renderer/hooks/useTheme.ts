import { useEffect } from 'react'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useUiStore, type ResolvedTheme } from '@renderer/stores/uiStore'
import type { ThemeMode } from '@shared/types/settings'

function resolve(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light'
  return mode
}

/**
 * Applies the active theme as a class on <html> and keeps it in sync with both
 * the user's setting and the OS preference. The resolved theme is published to
 * the UI store so any component can read it without re-running this effect.
 * Call exactly once, near the app root.
 */
export function useTheme(): void {
  const mode = useSettingsStore((s) => s.settings.theme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = (): void => {
      const next = resolve(mode, media.matches)
      const root = document.documentElement
      root.classList.toggle('dark', next === 'dark')
      root.classList.toggle('light', next === 'light')
      useUiStore.getState().setResolvedTheme(next)
    }

    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode])
}
