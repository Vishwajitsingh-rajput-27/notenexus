'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import { useAuthStore, useThemeStore } from '@/lib/store'
import { useRouter } from 'next/navigation'

// ── Data ──────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    group: 'INGESTION_MODULE',
    items: [
      'PDF, image, YouTube, voice, WhatsApp & plain text — every source, one place.',
      '4-stage OCR fallback for PDFs: pdf-parse → Groq Vision → Tesseract.js → Gemini 1.5 Flash.',
      '3-strategy YouTube cascade: yt-dlp → Supadata API → youtubei.js — bypasses geo-blocks.',
      'Auto language detection & translation — upload in any language, indexed in English.',
      'AI subject & chapter classification — every note auto-tagged with keyword extraction.',
      'File Vault — persistent file library separate from the notes index.',
    ],
  },
  {
    group: 'SEARCH_ENGINE',
    items: [
      'Natural language queries across all notes via Pinecone vector similarity (top-8 results).',
      'Semantic search — finds meaning, not just keywords.',
      'RAG Study Copilot — answers grounded in your own notes with 16-message history window.',
      '0.6 relevance threshold ensures only truly matching notes are surfaced.',
    ],
  },
  {
    group: 'REVISION_TOOLS',
    items: [
      'One-click AI flashcard generation — 10 Q&A cards from any note.',
      'AI-generated hierarchical mind maps rendered as visual knowledge trees.',
      'Saved Items Panel — bookmark notes, flashcards, and questions for fast retrieval.',
    ],
  },
  {
    group: 'AI_TOOLS',
    items: [
      'AI Tutor — contextual tutoring at Beginner / Intermediate / Advanced levels.',
      'Exam Predictor — MCQ, short & long answer questions with difficulty classification (Easy / Medium / Hard).',
      'Study Planner — AI builds a day-by-day revision schedule from your exam date & weak topics, with rest days built in.',
      'Revision Reminders — cron-scheduled email delivery via Gmail SMTP.',
    ],
  },
  {
    group: 'COLLABORATION_LAYER',
    items: [
      'Class Hub — shared note board with live upvotes & real-time typing indicators.',
      'Group Study Rooms — join via 6-character code, live member list, in-room AI quiz.',
      'Real-time leaderboard during quizzes — all Socket.io powered.',
      'Live cursors, shared boards, instant sync across all participants.',
    ],
  },
  {
    group: 'WHATSAPP_BOT',
    items: [
      'Open mode — anyone messages the Twilio number for instant AI replies.',
      'Linked mode — connect your account for note-aware answers & PDF ingestion over WhatsApp.',
      '20-message context per phone number with 24-hour TTL auto-expiry.',
    ],
  },
  {
    group: 'GAMIFICATION_LAYER',
    items: [
      'XP & Levelling — earn XP for uploads, quizzes, and study sessions; 500 XP per level.',
      'Badges: First Note 📝 · 3-Day Streak 🔥 · Week Warrior ⚡ · Month Master 🏆 · Quiz Master 🎯 · AI Pilot 🤖 · Team Player 👥.',
      'Streak tracking — current streak, longest streak, last study date.',
      'Performance Dashboard — subject readiness scores, weak-topic breakdown, weekly goal progress.',
    ],
  },
]

const STACK: Record<string, string[]> = {
  '// FRONTEND':         ['Next.js 14', 'React 18', 'TypeScript', 'Tailwind CSS', 'Framer Motion', 'Zustand', 'Socket.io', 'Axios'],
  '// BACKEND':          ['Node.js ≥18', 'Express 4', 'Socket.io 4', 'JWT', 'Nodemailer', 'Multer', 'node-cron'],
  '// DATABASE_STORAGE': ['MongoDB Atlas', 'Mongoose', 'Pinecone Vector DB', 'Cloudinary CDN'],
  '// AI_INTEGRATIONS':  ['Groq LLaMA 3.3', 'Google Gemini', 'Groq Whisper', 'Tesseract.js', 'Twilio WhatsApp', 'yt-dlp'],
  '// DEPLOYMENT':       ['Vercel', 'Render', 'PWA'],
}

// ── Theme tokens ──────────────────────────────────────────────────────────────
const DARK = {
  bg:          '#0a0a0a',
  bgCard:      '#0a0a0a',
  bgNav:       'rgba(10,10,10,0.93)',
  bgHover:     'rgba(251,255,72,0.04)',
  fg:          '#ffffff',
  fgDim:       'rgba(255,255,255,0.55)',
  fgMuted:     'rgba(255,255,255,0.35)',
  border:      'rgba(255,255,255,0.10)',
  borderMid:   'rgba(255,255,255,0.15)',
  borderSub:   'rgba(255,255,255,0.06)',
  divBg:       'rgba(255,255,255,0.05)',
  dot:         'rgba(255,255,255,0.08)',
  yellow:      '#FBFF48',
  yellowBtn:   '#FBFF48',
  red:         '#FF3B3B',
  green:       '#4ADE80',
  blue:        '#3B82F6',
  navLink:     'rgba(255,255,255,0.45)',
  badgeDimC:   'rgba(255,255,255,0.5)',
  badgeDimB:   'rgba(255,255,255,0.2)',
  btnSecC:     '#ffffff',
  btnSecB:     'rgba(255,255,255,0.25)',
  togBg:       '#1c1c1c',
  togBorder:   'rgba(255,255,255,0.12)',
  footerTag:   'rgba(255,255,255,0.3)',
  footerLink:  'rgba(255,255,255,0.4)',
  footerVer:   'rgba(255,255,255,0.2)',
  scrollbar:   'rgba(255,255,255,0.15)',
}

const LIGHT = {
  bg:          '#f0ede6',
  bgCard:      '#f0ede6',
  bgNav:       'rgba(240,237,230,0.94)',
  bgHover:     'rgba(0,0,0,0.03)',
  fg:          '#0a0a0a',
  fgDim:       'rgba(10,10,10,0.6)',
  fgMuted:     'rgba(10,10,10,0.4)',
  border:      'rgba(0,0,0,0.12)',
  borderMid:   'rgba(0,0,0,0.2)',
  borderSub:   'rgba(0,0,0,0.07)',
  divBg:       'rgba(0,0,0,0.06)',
  dot:         'rgba(0,0,0,0.07)',
  yellow:      '#b89200',
  yellowBtn:   '#FBFF48',
  red:         '#cc2200',
  green:       '#1a7a3a',
  blue:        '#1d4ed8',
  navLink:     'rgba(10,10,10,0.5)',
  badgeDimC:   'rgba(10,10,10,0.55)',
  badgeDimB:   'rgba(10,10,10,0.2)',
  btnSecC:     '#0a0a0a',
  btnSecB:     'rgba(0,0,0,0.25)',
  togBg:       '#e4e0d8',
  togBorder:   'rgba(0,0,0,0.15)',
  footerTag:   'rgba(0,0,0,0.4)',
  footerLink:  'rgba(0,0,0,0.5)',
  footerVer:   'rgba(0,0,0,0.3)',
  scrollbar:   'rgba(0,0,0,0.2)',
}

type Tok = Record<string, string>

// ── Reusable animated section title ──────────────────────────────────────────
function SectionTitle({ white, yellow, tok }: { white: string; yellow: string; tok: Tok }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  return (
    <motion.h2
      ref={ref}
      initial={{ opacity: 0, x: -40 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5 }}
      style={{
        fontFamily: "'Space Mono','Courier New',monospace",
        fontSize: 'clamp(26px,4vw,40px)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '-0.02em',
        marginBottom: 48,
        color: tok.fg,
        transition: 'color 0.4s',
      }}
    >
      <span>{white}</span>
      <span style={{ color: tok.yellow, transition: 'color 0.4s' }}>{yellow}</span>
    </motion.h2>
  )
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ group, items, index, tok }: { group: string; items: string[]; index: number; tok: Tok }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const [hovered, setHovered] = useState(false)
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.08, duration: 0.45 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? tok.bgHover : tok.bgCard,
        padding: 28,
        border: `1px solid ${hovered ? tok.yellow : tok.border}`,
        position: 'relative',
        transition: 'border-color 0.2s, background 0.2s',
        height: '100%',
      }}
    >
      <div style={{
        position: 'absolute', top: -1, right: -1,
        width: 12, height: 12,
        borderTop: `2px solid ${tok.yellow}`,
        borderRight: `2px solid ${tok.yellow}`,
        transition: 'border-color 0.4s',
      }} />
      <div style={{
        fontFamily: "'Space Mono',monospace",
        fontSize: 11, color: tok.yellow,
        letterSpacing: '0.15em', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'color 0.4s',
      }}>
        <span style={{ color: tok.fgMuted, transition: 'color 0.4s' }}>{'>'}</span>
        {group}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 13, color: tok.fgDim,
            lineHeight: 1.7, paddingLeft: 16,
            position: 'relative', marginBottom: 6,
            transition: 'color 0.4s',
          }}>
            <span style={{ position: 'absolute', left: 0, color: tok.fgMuted }}>·</span>
            {item}
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

// ── Stack tag ─────────────────────────────────────────────────────────────────
function StackTag({ tech, tok }: { tech: string; tok: Tok }) {
  const [hov, setHov] = useState(false)
  return (
    <span
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: 12, padding: '5px 12px',
        border: `1px solid ${hov ? tok.yellow : tok.border}`,
        color: hov ? tok.yellow : tok.fgDim,
        letterSpacing: '0.04em',
        transition: 'border-color 0.18s, color 0.18s',
        cursor: 'default',
      }}
    >{tech}</span>
  )
}

// ── Stack category ────────────────────────────────────────────────────────────
function StackCategory({ cat, items, delay, tok }: { cat: string; items: string[]; delay: number; tok: Tok }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay }}
    >
      <div style={{
        fontFamily: "'Space Mono',monospace",
        fontSize: 10, color: tok.fgMuted,
        letterSpacing: '0.15em',
        borderBottom: `1px solid ${tok.borderSub}`,
        paddingBottom: 10, marginBottom: 16,
        transition: 'color 0.4s, border-color 0.4s',
      }}>{cat}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map(tech => <StackTag key={tech} tech={tech} tok={tok} />)}
      </div>
    </motion.div>
  )
}

// ── Custom cursor ─────────────────────────────────────────────────────────────
function Cursor() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const move = (e: MouseEvent) => {
      el.style.left = e.clientX + 'px'
      el.style.top  = e.clientY + 'px'
    }
    document.addEventListener('mousemove', move)
    const attach = () => {
      document.querySelectorAll('a,button,[data-h]').forEach(t => {
        t.addEventListener('mouseenter', () => {
          el.style.width = '60px'; el.style.height = '60px'
          el.style.backgroundColor = '#FBFF48'
          el.style.mixBlendMode = 'normal'
          el.style.border = '2px solid #000'
        })
        t.addEventListener('mouseleave', () => {
          el.style.width = '24px'; el.style.height = '24px'
          el.style.backgroundColor = '#fff'
          el.style.mixBlendMode = 'difference'
          el.style.border = 'none'
        })
      })
    }
    attach()
    const obs = new MutationObserver(attach)
    obs.observe(document.body, { childList: true, subtree: true })
    return () => { document.removeEventListener('mousemove', move); obs.disconnect() }
  }, [])
  return (
    <div ref={ref} style={{
      width: 24, height: 24, background: '#fff',
      borderRadius: '50%', position: 'fixed',
      pointerEvents: 'none', zIndex: 9999,
      mixBlendMode: 'difference',
      transform: 'translate(-50%,-50%)',
      transition: 'width .18s, height .18s, background-color .18s, border .18s',
    }} />
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()
  const { dark, setDark } = useThemeStore()

  const toggle = useCallback((mode: 'dark' | 'light') => {
    setDark(mode === 'dark')
  }, [setDark])

  const tok = dark ? DARK : LIGHT

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [])

  const dotGrid: React.CSSProperties = {
    backgroundImage: `radial-gradient(${tok.dot} 1px, transparent 1px)`,
    backgroundSize: '24px 24px',
  }
  const mono: React.CSSProperties = { fontFamily: "'Space Mono','Courier New',monospace" }
  const ibm:  React.CSSProperties = { fontFamily: "'IBM Plex Mono','Courier New',monospace" }

  return (
    <>
      <style>{`
        * { cursor: none !important; }
        ::selection { background: #FBFF48; color: #000; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${tok.bg}; }
        ::-webkit-scrollbar-thumb { background: ${tok.scrollbar}; border-radius: 2px; }
      `}</style>

      <Cursor />

      <div style={{ background: tok.bg, color: tok.fg, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.4s, color 0.4s' }}>

        {/* ── NAV ── */}
        <nav style={{
          position: 'fixed', top: 0, width: '100%', zIndex: 100,
          background: tok.bgNav, backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${tok.border}`,
          height: 56, display: 'flex', alignItems: 'center',
          transition: 'background 0.4s, border-color 0.4s',
        }}>
          <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ ...mono, fontSize: 15, fontWeight: 700, letterSpacing: '0.04em', color: tok.fg, transition: 'color 0.4s' }}>
              NOTENEXUS<span style={{ color: tok.yellow, transition: 'color 0.4s' }}>.exe</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              {[['#hero','/ABOUT'],['#features','/FEATURES'],['#stack','/STACK']].map(([href, label]) => (
                <a key={label} href={href} style={{ ...mono, fontSize: 11, color: tok.navLink, letterSpacing: '0.1em', textDecoration: 'none', transition: 'color 0.2s' }}>{label}</a>
              ))}

              {/* Theme toggle */}
              <div style={{ display: 'flex', background: tok.togBg, border: `1px solid ${tok.togBorder}`, padding: 3, gap: 2, transition: 'background 0.4s, border-color 0.4s' }}>
                {(['dark','light'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => toggle(mode)}
                    style={{
                      ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '5px 11px', border: 'none',
                      background: (dark ? 'dark' : 'light') === mode ? '#FBFF48' : 'transparent',
                      color:      (dark ? 'dark' : 'light') === mode ? '#000' : tok.fgMuted,
                      transition: 'background 0.25s, color 0.25s',
                    }}
                  >
                    {mode === 'dark' ? '◐ DARK' : '○ LIGHT'}
                  </button>
                ))}
              </div>

              <Link href="/sign-up">
                <button style={{ ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', padding: '8px 14px', background: '#FBFF48', color: '#000', border: 'none' }}>
                  /GET_STARTED
                </button>
              </Link>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section id="hero" style={{ ...dotGrid, paddingTop: 140, paddingBottom: 100, paddingLeft: 32, paddingRight: 32, position: 'relative', overflow: 'hidden' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>

            {/* Floating shapes */}
            <div style={{ position: 'absolute', top: 0, left: -20, width: 48, height: 48, background: tok.blue, pointerEvents: 'none', animation: 'float1 6s ease-in-out infinite', transition: 'background 0.4s' }} />
            <div style={{ position: 'absolute', top: 80, right: 40, width: 60, height: 60, borderRadius: '50%', background: tok.red, pointerEvents: 'none', animation: 'float2 8s ease-in-out infinite', transition: 'background 0.4s' }} />
            <div style={{ position: 'absolute', bottom: -40, left: '38%', width: 20, height: 20, background: tok.yellow, pointerEvents: 'none', animation: 'float1 5s ease-in-out infinite reverse', transition: 'background 0.4s' }} />

            <style>{`
              @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
              @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(10px)} }
            `}</style>

            {/* Status pill */}
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${tok.borderMid}`, padding: '6px 14px', marginBottom: 40, ...ibm, fontSize: 12, transition: 'border-color 0.4s' }}
            >
              <span style={{ color: tok.green, fontSize: 10, transition: 'color 0.4s' }}>●</span>
              <span style={{ color: tok.fgDim, transition: 'color 0.4s' }}>SYSTEM STATUS: ONLINE</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
              style={{ ...mono, fontSize: 'clamp(40px,8vw,88px)', fontWeight: 700, lineHeight: 1.0, letterSpacing: '-0.03em', textTransform: 'uppercase', marginBottom: 24, color: tok.fg, transition: 'color 0.4s' }}
            >
              EVERY NOTE.<br />
              <span style={{ color: tok.yellow, transition: 'color 0.4s' }}>ONE PLACE.</span><br />
              ALWAYS READY.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              style={{ ...ibm, fontSize: 15, color: tok.fgDim, maxWidth: 560, lineHeight: 1.8, marginBottom: 32, transition: 'color 0.4s' }}
            >
              The unified knowledge platform that transforms PDFs, YouTube videos, voice recordings,
              images, and WhatsApp messages into an intelligent, searchable, and collaborative study engine.
            </motion.p>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} style={{ marginBottom: 40 }}>
              {[
                '> 4-stage OCR + 3-strategy YouTube cascade — handles every real-world format.',
                '> RAG Study Copilot grounded in your own notes via Pinecone semantic search.',
                '> Real-time collaboration, WhatsApp bot, gamification & AI exam prediction.',
              ].map((line, i) => (
                <div key={i} style={{ ...ibm, fontSize: 13, color: tok.fgDim, marginBottom: 7, transition: 'color 0.4s' }}>{line}</div>
              ))}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
              <div style={{ ...ibm, fontSize: 11, padding: '6px 14px', border: `1px solid ${tok.badgeDimB}`, color: tok.badgeDimC, letterSpacing: '0.08em', transition: 'border-color 0.4s, color 0.4s' }}>// LOCATION: WORLDWIDE</div>
              <div style={{ ...ibm, fontSize: 11, padding: '6px 14px', border: `1px solid ${tok.green}`, color: tok.green, letterSpacing: '0.08em', transition: 'border-color 0.4s, color 0.4s' }}>// STATUS: AI-POWERED · FREE</div>
              <div style={{ ...ibm, fontSize: 11, padding: '6px 14px', border: `1px solid ${tok.blue}`, color: tok.blue, letterSpacing: '0.08em', transition: 'border-color 0.4s, color 0.4s' }}>// PWA: INSTALLABLE</div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }} style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Link href="/sign-up">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  style={{ ...mono, fontSize: 13, fontWeight: 700, padding: '14px 32px', background: '#FBFF48', color: '#000', border: 'none', letterSpacing: '0.08em' }}>
                  START FOR FREE →
                </motion.button>
              </Link>
              <Link href="/sign-in">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  style={{ ...mono, fontSize: 13, fontWeight: 700, padding: '14px 32px', background: 'transparent', color: tok.btnSecC, border: `1px solid ${tok.btnSecB}`, letterSpacing: '0.08em', transition: 'color 0.4s, border-color 0.4s' }}>
                  SIGN IN
                </motion.button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ── DIVIDER ── */}
        <div style={{ borderTop: `1px solid ${tok.borderSub}`, transition: 'border-color 0.4s' }} />

        {/* ── FEATURE_LOG ── */}
        <section id="features" style={{ ...dotGrid, padding: '100px 32px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionTitle white="FEATURE" yellow="_LOG" tok={tok} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 1, background: tok.divBg, transition: 'background 0.4s' }}>
              {FEATURES.map((f, i) => (
                <div key={f.group} style={{ background: tok.bgCard, transition: 'background 0.4s' }}>
                  <FeatureCard group={f.group} items={f.items} index={i} tok={tok} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <div style={{ borderTop: `1px solid ${tok.borderSub}`, transition: 'border-color 0.4s' }} />

        {/* ── TECH_STACK ── */}
        <section id="stack" style={{ padding: '100px 32px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 56 }}>
              <SectionTitle white="TECH" yellow="_STACK" tok={tok} />
              <div style={{ ...ibm, fontSize: 11, color: tok.red, display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, transition: 'color 0.4s' }}>
                <span>●</span> // SYSTEM_OPTIMIZED
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 40 }}>
              {Object.entries(STACK).map(([cat, items], ci) => (
                <StackCategory key={cat} cat={cat} items={items} delay={ci * 0.1} tok={tok} />
              ))}
            </div>
          </div>
        </section>

        <div style={{ borderTop: `1px solid ${tok.borderSub}`, transition: 'border-color 0.4s' }} />

        {/* ── CTA ── */}
        <section style={{ ...dotGrid, padding: '100px 32px' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', border: `1px solid ${tok.border}`, padding: '64px 48px', position: 'relative', transition: 'border-color 0.4s' }}
          >
            {/* Corner accents */}
            {[{t:-1,l:-1,bt:'2px solid',br:'none',bb:'none',bl:'2px solid'},{t:-1,r:-1,bt:'2px solid',br:'2px solid',bb:'none',bl:'none'},{b:-1,l:-1,bt:'none',br:'none',bb:'2px solid',bl:'2px solid'},{b:-1,r:-1,bt:'none',br:'2px solid',bb:'2px solid',bl:'none'}].map((c,i) => (
              <div key={i} style={{ position:'absolute', width:20, height:20, top:c.t, bottom:c.b, left:c.l, right:c.r, borderTop:c.bt !== 'none' ? `${c.bt} ${tok.yellow}` : 'none', borderRight:c.br !== 'none' ? `${c.br} ${tok.yellow}` : 'none', borderBottom:c.bb !== 'none' ? `${c.bb} ${tok.yellow}` : 'none', borderLeft:c.bl !== 'none' ? `${c.bl} ${tok.yellow}` : 'none', transition:'border-color 0.4s' }} />
            ))}
            <div style={{ ...mono, fontSize: 11, color: tok.green, letterSpacing: '0.15em', marginBottom: 24, transition: 'color 0.4s' }}>● READY TO STUDY SMARTER?</div>
            <h2 style={{ ...mono, fontSize: 'clamp(28px,5vw,48px)', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 16, color: tok.fg, transition: 'color 0.4s' }}>
              JOIN THE<br /><span style={{ color: tok.yellow, transition: 'color 0.4s' }}>KNOWLEDGE HUB.</span>
            </h2>
            <p style={{ ...ibm, fontSize: 14, color: tok.fgDim, marginBottom: 40, transition: 'color 0.4s' }}>
              Upload from anywhere. AI organises everything.<br />
              No sign-up friction — use the demo account to explore instantly.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/sign-up">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  style={{ ...mono, fontSize: 14, fontWeight: 700, padding: '16px 48px', background: '#FBFF48', color: '#000', border: 'none', letterSpacing: '0.1em' }}>
                  GET STARTED FREE →
                </motion.button>
              </Link>
              <a href="https://notenexus-azure.vercel.app" target="_blank" rel="noopener noreferrer">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  style={{ ...mono, fontSize: 14, fontWeight: 700, padding: '16px 48px', background: 'transparent', color: tok.btnSecC, border: `1px solid ${tok.btnSecB}`, letterSpacing: '0.1em', transition: 'color 0.4s, border-color 0.4s' }}>
                  LIVE DEMO ↗
                </motion.button>
              </a>
            </div>
          </motion.div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: `1px solid ${tok.borderSub}`, padding: '40px 32px', transition: 'border-color 0.4s' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ ...mono, fontSize: 14, fontWeight: 700, marginBottom: 6, color: tok.fg, transition: 'color 0.4s' }}>
                NOTENEXUS<span style={{ color: tok.yellow, transition: 'color 0.4s' }}>.exe</span>
              </div>
              <div style={{ ...ibm, fontSize: 11, color: tok.footerTag, transition: 'color 0.4s' }}>Every note. One place. Always ready.</div>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              {[['/sign-in','/SIGN-IN'],['/sign-up','/SIGN-UP'],['/dashboard','/DASHBOARD']].map(([href,label]) => (
                <Link key={label} href={href} style={{ ...ibm, fontSize: 11, color: tok.footerLink, textDecoration: 'none', letterSpacing: '0.08em', transition: 'color 0.4s' }}>{label}</Link>
              ))}
            </div>
            <div style={{ ...ibm, fontSize: 10, color: tok.footerVer, letterSpacing: '0.1em', transition: 'color 0.4s' }}>// v1.0.0 — NoteNexus</div>
          </div>
        </footer>

      </div>
    </>
  )
}
