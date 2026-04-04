import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'
import ThemeSync from '@/components/ThemeSync'

export const metadata: Metadata = {
  title: 'NoteNexus.exe — Every Note. One Place.',
  description: 'AI-powered unified student note management with real-time collaboration.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FBFF48" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeSync />
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1a1a',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '0',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '12px',
            },
            success: { iconTheme: { primary: '#4ADE80', secondary: '#0a0a0a' } },
            error:   { iconTheme: { primary: '#FF3B3B', secondary: '#0a0a0a' } },
          }}
        />
      <script dangerouslySetInnerHTML={{__html: `
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(()=>{})
          })
        }
      `}} />
      </body>
    </html>
  )
}
