'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, useThemeStore } from '@/lib/store'
import { motion } from 'framer-motion'

const BACKEND = process.env.NEXT_PUBLIC_API_URL?.replace('/api','') || 'http://localhost:5000'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const { dark } = useThemeStore()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/sign-in')
  }, [])

  // Wake up the Render free-tier backend the moment the dashboard loads.
  // Then keep pinging every 9 minutes so it never sleeps while the user is active.
  // This prevents all "Failed to fetch" errors caused by the server being asleep.
  useEffect(() => {
    const ping = () => fetch(`${BACKEND}/ping`).catch(() => {})
    ping()
    const interval = setInterval(ping, 9 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!isAuthenticated()) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        minHeight: '100vh',
        background: dark ? '#0a0a0a' : '#f0ede6',
        transition: 'background 0.4s',
      }}
    >
      {children}
    </motion.div>
  )
}
