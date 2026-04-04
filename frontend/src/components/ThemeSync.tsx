'use client'
// ThemeSync — applies 'light' class to <body> based on zustand theme store
// Place this file at: src/components/ThemeSync.tsx
import { useEffect } from 'react'
import { useThemeStore } from '@/lib/store'

export default function ThemeSync() {
  const { dark } = useThemeStore()

  useEffect(() => {
    if (dark) {
      document.body.classList.remove('light')
    } else {
      document.body.classList.add('light')
    }
  }, [dark])

  return null
}
