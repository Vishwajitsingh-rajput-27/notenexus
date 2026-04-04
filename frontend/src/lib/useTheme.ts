// src/lib/useTheme.ts
// Single source of truth for all theme tokens used by every component
import { useThemeStore } from './store'

export const mono = "'Space Mono','Courier New',monospace"
export const ibm  = "'IBM Plex Mono','Courier New',monospace"

export interface ThemeTokens {
  dark: boolean
  bg:        string
  bg2:       string
  bg3:       string
  fg:        string
  fgDim:     string
  fgMuted:   string
  border:    string
  borderSub: string
  inpBg:     string
  inpBorder: string
  inpText:   string
  inpPh:     string
  cardBg:    string
  cardBorder:string
  accent:    string
  accentBorder: string
}

const DARK: ThemeTokens = {
  dark:       true,
  bg:         '#0a0a0a',
  bg2:        '#111111',
  bg3:        '#1a1a1a',
  fg:         '#ffffff',
  fgDim:      'rgba(255,255,255,0.35)',
  fgMuted:    'rgba(255,255,255,0.18)',
  border:     'rgba(255,255,255,0.10)',
  borderSub:  'rgba(255,255,255,0.06)',
  inpBg:      'rgba(255,255,255,0.03)',
  inpBorder:  'rgba(255,255,255,0.12)',
  inpText:    '#ffffff',
  inpPh:      'rgba(255,255,255,0.25)',
  cardBg:     'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.08)',
  accent:     '#FBFF48',
  accentBorder: 'rgba(251,255,72,0.3)',
}

const LIGHT: ThemeTokens = {
  dark:       false,
  bg:         '#f0ede6',
  bg2:        '#e8e4dc',
  bg3:        '#dedad2',
  fg:         '#0a0a0a',
  fgDim:      'rgba(10,10,10,0.50)',
  fgMuted:    'rgba(10,10,10,0.28)',
  border:     'rgba(0,0,0,0.12)',
  borderSub:  'rgba(0,0,0,0.07)',
  inpBg:      'rgba(0,0,0,0.05)',
  inpBorder:  'rgba(0,0,0,0.18)',
  inpText:    '#0a0a0a',
  inpPh:      'rgba(10,10,10,0.38)',
  cardBg:     'rgba(0,0,0,0.04)',
  cardBorder: 'rgba(0,0,0,0.10)',
  accent:     '#d97706',
  accentBorder: 'rgba(217,119,6,0.35)',
}

export function useTheme(): ThemeTokens {
  const { dark } = useThemeStore()
  return dark ? DARK : LIGHT
}
