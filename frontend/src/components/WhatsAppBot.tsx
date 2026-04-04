'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme, mono, ibm } from '@/lib/useTheme'
import Cookies from 'js-cookie'

// Use the same backend URL as the rest of the app (lib/api.ts)
// Falls back to the correct Render deployment if env var is not set
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api')
  .replace(/\/api\/?$/, '') // strip trailing /api so paths like /ping work correctly

const COMMAND_SECTIONS = [
  {
    id: 'vault',
    label: '// FILE_VAULT_COMMANDS',
    color: '#FBFF48',
    badge: 'requires linked account',
    commands: [
      { cmd: 'files',         desc: 'List ALL files in your vault (PDFs, images, voice, links)' },
      { cmd: 'files pdf',     desc: 'List only your PDF files' },
      { cmd: 'files image',   desc: 'List only your saved images' },
      { cmd: 'files voice',   desc: 'List only your voice notes' },
      { cmd: 'files link',    desc: 'List only your saved links' },
      { cmd: 'file 1',        desc: 'Receive file #1 directly — original PDF, image, or voice sent back to you' },
    ],
  },
  {
    id: 'notes',
    label: '// NOTES_COMMANDS',
    color: '#79c0ff',
    badge: 'requires linked account',
    commands: [
      { cmd: 'notes',                 desc: 'List your 20 most recent notes' },
      { cmd: 'notes: Biology',        desc: 'Filter notes by subject' },
      { cmd: 'saved',                 desc: 'List all saved items (flashcards, plans, mind maps…)' },
      { cmd: 'saved: flashcards',     desc: 'Filter by type — flashcards / examquestions / mindmap / studyplan / quiz' },
      { cmd: '1',                     desc: 'Read note/item #1 from the last list' },
      { cmd: 'images 2',             desc: 'Get extracted images from note #2' },
    ],
  },
  {
    id: 'study',
    label: '// STUDY_STATS_COMMANDS',
    color: '#4ADE80',
    badge: 'requires linked account',
    commands: [
      { cmd: 'streak',      desc: 'See your current streak, XP level, weekly progress & badges' },
      { cmd: 'analytics',   desc: 'View subject-by-subject readiness scores as a bar chart' },
      { cmd: 'badges',      desc: 'List all your earned achievement badges with dates' },
    ],
  },
  {
    id: 'reminders',
    label: '// REMINDER_COMMANDS',
    color: '#c678dd',
    badge: 'requires linked account',
    commands: [
      { cmd: 'remind me: Calculus | Maths | today 18:00',              desc: 'One-shot reminder today at a specific time' },
      { cmd: 'remind me: Cell biology | Biology | every 3 days 09:00', desc: 'Repeating reminder every N days' },
      { cmd: 'remind me: Vocab | English | every 30 minutes',          desc: 'Sprint mode — repeat every N minutes' },
      { cmd: 'reminders',                                               desc: 'List all your active reminders' },
      { cmd: 'cancel reminder 2',                                       desc: 'Cancel reminder #2 from the list' },
    ],
  },
  {
    id: 'upload',
    label: '// UPLOAD_COMMANDS',
    color: '#60A5FA',
    badge: 'requires linked account',
    commands: [
      { cmd: '📄 Send PDF',    desc: 'PDF is saved to File Vault + text extracted as note (original file preserved)' },
      { cmd: '📷 Send Image',  desc: 'Image saved to vault + text extracted. Original image stored as-is' },
      { cmd: '🎙 Send Voice',  desc: 'Voice note saved to vault + transcribed as note' },
    ],
  },
  {
    id: 'ai',
    label: '// AI_COMMANDS',
    color: '#FF6B35',
    badge: 'no account needed',
    commands: [
      { cmd: 'summary: <your notes>',   desc: 'Get a 5-bullet summary of any text' },
      { cmd: 'flashcard: <your notes>', desc: 'Generate 5 Q&A flashcard pairs' },
      { cmd: 'ask: <any question>',     desc: 'Get a direct answer — from your notes when relevant' },
      { cmd: 'plan: <subjects>',        desc: 'Get a quick 3-day study plan' },
      { cmd: 'What is photosynthesis?', desc: 'Just ask anything — all topics welcome' },
    ],
  },
  {
    id: 'account',
    label: '// ACCOUNT_COMMANDS',
    color: '#94A3B8',
    badge: 'universal',
    commands: [
      { cmd: 'link CODE',  desc: 'Connect your NoteNexus account using a link code from the app' },
      { cmd: 'unlink',     desc: 'Disconnect this WhatsApp number from your account' },
      { cmd: 'reset',      desc: 'Clear conversation history and start fresh' },
      { cmd: 'help',       desc: 'Show all commands in WhatsApp' },
    ],
  },
]

const STEPS = [
  { n: '01', title: 'CREATE_TWILIO_ACCOUNT',   detail: 'Go to twilio.com/try-twilio → Sign up free → Verify phone number' },
  { n: '02', title: 'ENABLE_WHATSAPP_SANDBOX', detail: 'Twilio Console → Messaging → Try it out → WhatsApp → Follow instructions to join sandbox' },
  { n: '03', title: 'ADD_ENV_VARS',            detail: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886' },
  { n: '04', title: 'SET_WEBHOOK_URL',         detail: 'Twilio Console → WhatsApp Sandbox → "When a message comes in" → POST → your-backend.com/api/whatsapp/webhook' },
  { n: '05', title: 'INSTALL_TWILIO_PKG',      detail: 'In your backend folder: npm install twilio → commit & push to GitHub' },
]

function CountdownTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    if (left <= 0) { onExpire(); return }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left, onExpire])

  const pct   = (left / seconds) * 100
  const color = left < 60 ? '#f87171' : left < 120 ? '#FBFF48' : '#4ADE80'
  const mm    = String(Math.floor(left / 60)).padStart(2, '0')
  const ss    = String(left % 60).padStart(2, '0')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 1s linear, background 0.3s' }} />
      </div>
      <span style={{ fontFamily: mono, fontSize: 11, color, minWidth: 36 }}>{mm}:{ss}</span>
    </div>
  )
}

// Ping backend — retries 3 times with 90s timeout each.
// Render free tier returns 503 while waking up, so we retry on non-ok too.
async function pingServer(timeoutMs = 90000): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 5000))
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(`${API}/ping`, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return true
      // 503 = Render is still waking up — retry
    } catch {
      // timeout or network error — retry
    }
  }
  return false
}

// Fetch with 90s timeout — Render free tier cold-start can take ~60s
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 90000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

export default function WhatsAppBot() {
  const t = useTheme()
  const [serverOnline, setServerOnline]       = useState<boolean | null>(null) // null = checking
  const [status, setStatus]                   = useState<Record<string, unknown> | null>(null)
  const [linkStatus, setLinkStatus]           = useState<Record<string, unknown> | null>(null)
  const [linkCode, setLinkCode]               = useState<string | null>(null)
  const [codeLoading, setCodeLoading]         = useState(false)
  const [unlinkLoading, setUnlinkLoading]     = useState(false)
  const [copied, setCopied]                   = useState(false)
  const [openSection, setOpenSection]         = useState<string | null>('notes')
  const [error, setError]                     = useState<string | null>(null)
  const keepaliveRef                          = useRef<ReturnType<typeof setInterval> | null>(null)

  const token = Cookies.get('nn_token')

  // On mount: ping to wake server, then fetch status
  useEffect(() => {
    let cancelled = false

    async function init() {
      setServerOnline(null) // show "connecting..."

      // Ping first — this wakes up Render free tier if it's sleeping
      const online = await pingServer(60000)
      if (cancelled) return

      if (!online) {
        setServerOnline(false)
        return
      }

      setServerOnline(true)

      // Now fetch status and link-status
      if (token) {
        try {
          const [r1, r2] = await Promise.all([
            fetchWithTimeout(`${API}/api/whatsapp/status`,      { headers: { Authorization: `Bearer ${token}` } }),
            fetchWithTimeout(`${API}/api/whatsapp/link-status`, { headers: { Authorization: `Bearer ${token}` } }),
          ])
          if (!cancelled) {
            if (r1.ok) setStatus(await r1.json())
            if (r2.ok) setLinkStatus(await r2.json())
          }
        } catch {
          // status stays null — not critical
        }
      }
    }

    init()

    // Keepalive: ping every 10 minutes so Render never sleeps while user is on page
    keepaliveRef.current = setInterval(() => {
      fetch(`${API}/ping`).catch(() => {})
    }, 10 * 60 * 1000)

    return () => {
      cancelled = true
      if (keepaliveRef.current) clearInterval(keepaliveRef.current)
    }
  }, [token])

  const refetchStatus = useCallback(async () => {
    if (!token) return
    try {
      const [r1, r2] = await Promise.all([
        fetchWithTimeout(`${API}/api/whatsapp/status`,      { headers: { Authorization: `Bearer ${token}` } }),
        fetchWithTimeout(`${API}/api/whatsapp/link-status`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (r1.ok) setStatus(await r1.json())
      if (r2.ok) setLinkStatus(await r2.json())
    } catch {
      // ignore
    }
  }, [token])

  async function generateCode() {
    if (!token) { setError('Please log in first'); return }
    setCodeLoading(true)
    setLinkCode(null)
    setError(null)

    try {
      // If server went offline since init, wake it again
      if (!serverOnline) {
        setError('Waking up server… please wait up to 60s (Render cold start)')
        const ok = await pingServer(60000)
        if (!ok) { setError('Server is unreachable. Try again in a moment.'); return }
        setServerOnline(true)
        setError(null)
      }

      const response = await fetchWithTimeout(
        `${API}/api/whatsapp/generate-link-code`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        },
        60000,
      )

      const data = await response.json()

      if (!response.ok) {
        setError(data.message || `Server error ${response.status} — please try again`)
        return
      }

      if (data.code) {
        setLinkCode(data.code)
      } else {
        setError('No code received from server')
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      setError(isAbort
        ? 'Request timed out — server may be waking up. Please try again.'
        : 'Network error — please check your connection and try again',
      )
    } finally {
      setCodeLoading(false)
    }
  }

  async function unlink() {
    if (!token) return
    setUnlinkLoading(true)
    try {
      await fetchWithTimeout(
        `${API}/api/whatsapp/unlink`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      setLinkStatus({ linked: false, phone: null })
      setLinkCode(null)
    } catch (err) {
      console.error('[unlink]', err)
    } finally {
      setUnlinkLoading(false)
      refetchStatus()
    }
  }

  function copyCode() {
    if (!linkCode) return
    navigator.clipboard.writeText(`link ${linkCode}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const card: React.CSSProperties = { background: t.bg3, border: `1px solid ${t.border}` }
  const btn: React.CSSProperties  = {
    fontFamily: mono, fontSize: 11, letterSpacing: '0.08em',
    fontWeight: 700, padding: '8px 16px', border: 'none', cursor: 'pointer',
  }

  // ── Server status banner ──────────────────────────────────────────────────
  const serverStatusBanner = () => {
    if (serverOnline === null) {
      return (
        <div style={{
          border: '1px solid rgba(251,255,72,0.2)', padding: '12px 18px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(251,255,72,0.04)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FBFF48', boxShadow: '0 0 8px #FBFF48', animation: 'pulse 1s infinite', flexShrink: 0 }} />
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#FBFF48' }}>
            SERVER: CONNECTING… (may take up to 30s)
          </span>
        </div>
      )
    }
    if (serverOnline === false) {
      return (
        <div style={{
          border: '1px solid rgba(248,113,113,0.3)', padding: '12px 18px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(248,113,113,0.06)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#f87171' }}>
            SERVER: UNREACHABLE
          </span>
          <button
            onClick={() => { setServerOnline(null); pingServer(60000).then(ok => { setServerOnline(ok); if (ok) refetchStatus() }) }}
            style={{ ...btn, marginLeft: 'auto', background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', padding: '4px 12px' }}
          >
            RETRY
          </button>
        </div>
      )
    }
    // Online
    return (
      <div style={{
        border: `1px solid ${status?.configured ? 'rgba(74,222,128,0.3)' : 'rgba(251,255,72,0.2)'}`,
        padding: '12px 18px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 10,
        background: status?.configured ? 'rgba(74,222,128,0.05)' : 'rgba(251,255,72,0.04)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: status?.configured ? '#4ADE80' : '#FBFF48',
          boxShadow: status?.configured ? '0 0 8px #4ADE80' : '0 0 8px #FBFF48',
        }} />
        <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: status?.configured ? '#4ADE80' : '#FBFF48' }}>
          {status?.configured ? 'BOT_STATUS: LIVE' : 'BOT_STATUS: SETUP_REQUIRED'}
        </span>
        {status?.configured && (
          <span style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, marginLeft: 'auto' }}>+1 415 523 8886</span>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#4ADE80', letterSpacing: '0.15em', marginBottom: 6 }}>
          // CONNECT
        </div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg, margin: 0 }}>
          WHATSAPP<span style={{ color: '#4ADE80' }}>_BOT</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 6 }}>
          Access notes, reminders and AI study tools from WhatsApp — or ask the bot <em>anything</em>.
        </p>
      </div>

      {/* Bot / server status banner */}
      {serverStatusBanner()}

      {/* Setup guide — only show when server responded and Twilio not configured */}
      {serverOnline === true && !status?.configured && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: t.accent, letterSpacing: '0.12em', fontWeight: 700 }}>
              // SETUP_GUIDE (~10 min, free)
            </span>
          </div>
          {STEPS.map(({ n, title, detail }) => (
            <div key={n} style={{ display: 'flex', gap: 16, padding: '12px 18px', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: t.accent, flexShrink: 0, width: 24, paddingTop: 2 }}>{n}</div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, color: t.fg, fontWeight: 700, marginBottom: 3 }}>{title}</div>
                <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, lineHeight: 1.6 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Account link panel */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: t.accent, letterSpacing: '0.12em', fontWeight: 700 }}>
            // ACCOUNT_LINK
          </span>
          {linkStatus?.linked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 6px #4ADE80' }} />
              <span style={{ fontFamily: mono, fontSize: 10, color: '#4ADE80', letterSpacing: '0.1em' }}>LINKED</span>
            </div>
          )}
        </div>

        <div style={{ padding: 18 }}>
          {linkStatus?.linked ? (
            <div>
              <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg, marginBottom: 4 }}>
                Linked to <strong>{linkStatus.phone as string}</strong>
              </div>
              <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginBottom: 16, lineHeight: 1.6 }}>
                Your account is connected. Use all commands below from WhatsApp.
              </div>
              <button
                style={{ ...btn, background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
                onClick={unlink}
                disabled={unlinkLoading}
              >
                {unlinkLoading ? 'UNLINKING...' : 'UNLINK_ACCOUNT'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontFamily: ibm, fontSize: 13, color: t.fgDim, marginBottom: 14, lineHeight: 1.6 }}>
                Link your WhatsApp to access notes, saved items and reminders. Code expires in 10 minutes.
              </div>
              <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, lineHeight: 2, marginBottom: 18 }}>
                1. Click <em>Generate Link Code</em> below<br />
                2. Open WhatsApp → message <strong>+1 415 523 8886</strong><br />
                3. Send: <code style={{ fontFamily: mono, color: '#4ADE80', background: 'rgba(74,222,128,0.08)', padding: '1px 6px' }}>link {'<'}CODE{'>'}</code>
              </div>

              {error && (
                <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', padding: '10px 14px', marginBottom: 14, fontFamily: mono, fontSize: 11, color: '#f87171' }}>
                  ❌ {error}
                </div>
              )}

              {linkCode ? (
                <div>
                  <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', padding: '16px 18px', marginBottom: 12 }}>
                    <div style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, letterSpacing: '0.12em', marginBottom: 8 }}>YOUR_LINK_CODE</div>
                    <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: '#4ADE80', letterSpacing: '0.25em' }}>{linkCode}</div>
                    <CountdownTimer seconds={600} onExpire={() => setLinkCode(null)} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={{ ...btn, background: '#4ADE80', color: '#0a0a0a' }} onClick={copyCode}>
                      {copied ? '✓ COPIED!' : `COPY  link ${linkCode}`}
                    </button>
                    <button
                      style={{ ...btn, background: 'transparent', color: t.fgDim, border: `1px solid ${t.border}` }}
                      onClick={generateCode}
                      disabled={codeLoading}
                    >
                      REGENERATE
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  style={{ ...btn, background: '#4ADE80', color: '#0a0a0a', opacity: (codeLoading || serverOnline === null) ? 0.7 : 1 }}
                  onClick={generateCode}
                  disabled={codeLoading || serverOnline === null}
                >
                  {codeLoading ? '⏳ GENERATING...' : serverOnline === null ? '⏳ CONNECTING...' : '⚡ GENERATE_LINK_CODE'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Command sections — accordion */}
      {COMMAND_SECTIONS.map((section) => {
        const open = openSection === section.id
        return (
          <div key={section.id} style={{ ...card, marginBottom: 12 }}>
            <div
              onClick={() => setOpenSection(open ? null : section.id)}
              style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: section.color, letterSpacing: '0.12em', fontWeight: 700 }}>
                  {section.label}
                </span>
                <span style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, background: t.bg, border: `1px solid ${t.border}`, padding: '2px 8px', letterSpacing: '0.08em' }}>
                  {section.badge}
                </span>
              </div>
              <span style={{ fontFamily: mono, fontSize: 12, color: t.fgDim }}>{open ? '▲' : '▼'}</span>
            </div>

            {open && (
              <div style={{ borderTop: `1px solid ${t.border}` }}>
                {section.commands.map((c, i) => (
                  <div key={i} style={{ display: 'flex', borderBottom: i < section.commands.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                    <code style={{ fontFamily: mono, fontSize: 11, color: section.color, flexShrink: 0, padding: '12px 18px', borderRight: `1px solid ${t.border}`, minWidth: 260, wordBreak: 'break-all', lineHeight: 1.5 }}>
                      {c.cmd}
                    </code>
                    <span style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, padding: '12px 16px', lineHeight: 1.6 }}>
                      {c.desc}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Webhook URL */}
      {status?.webhookUrl && (
        <div style={{ ...card, padding: '12px 18px', marginTop: 12 }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, letterSpacing: '0.12em', marginBottom: 6 }}>// WEBHOOK_URL</div>
          <code style={{ fontFamily: mono, fontSize: 11, color: t.accent, wordBreak: 'break-all' }}>
            {status.webhookUrl as string}
          </code>
        </div>
      )}
    </div>
  )
}
