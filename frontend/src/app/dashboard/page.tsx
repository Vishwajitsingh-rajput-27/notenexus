'use client'
import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore, useThemeStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import UploadNote        from '@/components/notes/UploadNote'
import NotesList         from '@/components/notes/NotesList'
import SearchBar         from '@/components/notes/SearchBar'
import Flashcards        from '@/components/revision/Flashcards'
import MindMap           from '@/components/revision/MindMap'
import ClassHub          from '@/components/notes/ClassHub'
import Profile           from '@/components/profile/Profile'
import { useSocket, disconnectSocket } from '@/hooks/useSocket'
import ExamPredictor     from '@/components/ExamPredictor'
import StudyPlanner      from '@/components/StudyPlanner'
import AiTutor           from '@/components/AiTutor'
import RevisionReminders from '@/components/RevisionReminders'
import WhatsAppBot       from '@/components/WhatsAppBot'
import PerformanceDashboard from '@/components/PerformanceDashboard'
import StudyCopilot         from '@/components/StudyCopilot'
import GroupStudy           from '@/components/GroupStudy'
import FileVault            from '@/components/FileVault'
import DemoModeBanner       from '@/components/DemoModeBanner'
import StreakWidget         from '@/components/StreakWidget'

const mono = "'Space Mono','Courier New',monospace"
const ibm  = "'IBM Plex Mono','Courier New',monospace"

// ── Theme token objects ───────────────────────────────────────────────────────
const DARK_T = {
  bg:        '#0a0a0a',
  sidebar:   '#0d0d0d',
  topbar:    'rgba(10,10,10,0.95)',
  border:    'rgba(255,255,255,0.07)',
  borderSub: 'rgba(255,255,255,0.06)',
  fg:        '#ffffff',
  fgDim:     'rgba(255,255,255,0.3)',
  togBg:     '#1c1c1c',
  togBorder: 'rgba(255,255,255,0.12)',
  scrollbar: 'rgba(255,255,255,0.12)',
}

const LIGHT_T = {
  bg:        '#f0ede6',
  sidebar:   '#e8e4dc',
  topbar:    'rgba(240,237,230,0.97)',
  border:    'rgba(0,0,0,0.10)',
  borderSub: 'rgba(0,0,0,0.07)',
  fg:        '#0a0a0a',
  fgDim:     'rgba(10,10,10,0.4)',
  togBg:     '#dedad2',
  togBorder: 'rgba(0,0,0,0.15)',
  scrollbar: 'rgba(0,0,0,0.15)',
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'upload',     label: 'UPLOAD',        tag: 'notes'    },
  { id: 'notes',      label: 'MY_NOTES',      tag: 'notes'    },
  { id: 'search',     label: 'SEARCH',        tag: 'notes'    },
  { id: 'vault',      label: 'FILE_VAULT 🗄', tag: 'notes'    },
  { id: 'flashcards', label: 'FLASHCARDS',    tag: 'revision' },
  { id: 'mindmap',    label: 'MIND_MAP',      tag: 'revision' },
  { id: 'copilot',    label: 'COPILOT ⭐',    tag: 'ai'       },
  { id: 'analytics',  label: 'ANALYTICS',     tag: 'ai'       },
  { id: 'tutor',      label: 'AI_TUTOR',      tag: 'ai'       },
  { id: 'exam',       label: 'EXAM_PRED',     tag: 'ai'       },
  { id: 'planner',    label: 'STUDY_PLAN',    tag: 'ai'       },
  { id: 'reminders',  label: 'REMINDERS',     tag: 'ai'       },
  { id: 'class',      label: 'CLASS_HUB',     tag: 'collab'   },
  { id: 'group',      label: 'GROUP_STUDY',   tag: 'collab'   },
  { id: 'whatsapp',   label: 'WHATSAPP',      tag: 'connect'  },
  { id: 'profile',    label: 'PROFILE',       tag: 'account'  },
]

const TAG_COLORS: Record<string, string> = {
  notes:    '#FBFF48',
  revision: '#4ADE80',
  collab:   '#60A5FA',
  ai:       '#FF3B3B',
  connect:  '#A78BFA',
  account:  'rgba(255,255,255,0.4)',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [tab, setTab]               = useState('upload')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { user, logout }            = useAuthStore()
  const { dark, setDark }           = useThemeStore()   // ← theme
  const tok                         = dark ? DARK_T : LIGHT_T
  const router                      = useRouter()
  const socket                      = useSocket()
  const [activeNote, setActiveNote] = useState<{
    content: string; subject: string; title: string
  } | null>(null)

  useEffect(() => {
    if (!socket) return
    socket.on('shared-note-alert', ({ title, sharedBy }: any) => {
      toast(`${sharedBy} shared: "${title}"`, { duration: 4000 })
    })
    return () => { socket.off('shared-note-alert') }
  }, [socket])

  const handleLogout = () => {
    disconnectSocket()
    logout()
    router.push('/')
    toast.success('Signed out')
  }

  const handleSendToAI = useCallback((targetTab: string, note: any) => {
    setActiveNote({
      content: note.content || note.rawText || note.summary || '',
      subject: note.subject || '',
      title:   note.title   || '',
    })
    setTab(targetTab)
  }, [])

  const currentTab = TABS.find(t => t.id === tab)!

  return (
    <>
      {/* ── Global styles (theme-aware) ── */}
      <style>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: ${tok.bg};
          color: ${tok.fg};
          font-family: ${ibm};
          transition: background 0.4s, color 0.4s;
        }
        ::selection { background: #FBFF48; color: #000; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${tok.bg}; }
        ::-webkit-scrollbar-thumb { background: ${tok.scrollbar}; border-radius: 2px; }
        input, textarea, select { font-family: ${ibm} !important; }
      `}</style>

      <div style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: tok.bg,
        color: tok.fg,
        transition: 'background 0.4s, color 0.4s',
      }}>

        {/* ══════════════════════════════════════════════
            SIDEBAR
        ══════════════════════════════════════════════ */}
        <aside style={{
          width: sidebarOpen ? 220 : 56,
          background: tok.sidebar,
          borderRight: `1px solid ${tok.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.25s ease, background 0.4s, border-color 0.4s',
          flexShrink: 0,
          overflow: 'hidden',
        }}>

          {/* Logo row */}
          <div style={{
            padding: '18px 16px',
            borderBottom: `1px solid ${tok.borderSub}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            transition: 'border-color 0.4s',
          }}>
            <span style={{
              fontFamily: mono,
              fontSize: 13,
              fontWeight: 700,
              color: tok.fg,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              transition: 'color 0.4s',
            }}>
              {sidebarOpen
                ? <>NN<span style={{ color: '#FBFF48' }}>.exe</span></>
                : <span style={{ color: '#FBFF48' }}>N</span>
              }
            </span>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                background: 'none',
                border: 'none',
                color: tok.fgDim,
                fontFamily: mono,
                fontSize: 12,
                padding: '2px 4px',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'color 0.4s',
              }}
            >
              {sidebarOpen ? '←' : '→'}
            </button>
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
            {TABS.map(t => {
              const isActive = tab === t.id
              const dotColor = TAG_COLORS[t.tag]
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  title={t.label}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    marginBottom: 2,
                    background: isActive ? 'rgba(251,255,72,0.07)' : 'transparent',
                    border: isActive
                      ? '1px solid rgba(251,255,72,0.2)'
                      : '1px solid transparent',
                    color: isActive ? tok.fg : tok.fgDim,
                    fontFamily: mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textAlign: 'left',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.color = tok.fg
                  }}
                  onMouseLeave={e => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.color = tok.fgDim
                  }}
                >
                  <span style={{
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }} />
                  {sidebarOpen && (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.label}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Streak Widget */}
          <StreakWidget dark={dark} collapsed={!sidebarOpen} />

          {/* User row */}
          <div style={{
            padding: '12px 8px',
            borderTop: `1px solid ${tok.borderSub}`,
            transition: 'border-color 0.4s',
          }}>
            {sidebarOpen && (
              <div style={{ padding: '8px 10px', marginBottom: 4 }}>
                <div style={{
                  fontFamily: mono,
                  fontSize: 10,
                  color: '#FBFF48',
                  marginBottom: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user?.name?.toUpperCase()}
                </div>
                <div style={{
                  fontFamily: ibm,
                  fontSize: 10,
                  color: tok.fgDim,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.4s',
                }}>
                  {user?.email}
                </div>
              </div>
            )}

            <button
              onClick={handleLogout}
              title="Sign out"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: 'transparent',
                border: '1px solid transparent',
                color: tok.fgDim,
                fontFamily: mono,
                fontSize: 10,
                letterSpacing: '0.08em',
                transition: 'color 0.15s, border-color 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#FF3B3B'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,59,59,0.2)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = tok.fgDim
                ;(e.currentTarget as HTMLElement).style.borderColor = 'transparent'
              }}
            >
              <span>⏻</span>
              {sidebarOpen && 'SIGN_OUT'}
            </button>
          </div>
        </aside>

        {/* ══════════════════════════════════════════════
            MAIN AREA
        ══════════════════════════════════════════════ */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* ── Top bar ── */}
          <div style={{
            background: tok.topbar,
            borderBottom: `1px solid ${tok.border}`,
            padding: '0 24px',
            height: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            transition: 'background 0.4s, border-color 0.4s',
          }}>

            {/* Left: current tab label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontFamily: mono,
                fontSize: 11,
                color: tok.fgDim,
                letterSpacing: '0.1em',
                transition: 'color 0.4s',
              }}>{'>'}</span>

              <span style={{
                fontFamily: mono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: tok.fg,
                transition: 'color 0.4s',
              }}>
                {currentTab.label}
              </span>

              <span style={{
                width: 6, height: 6,
                borderRadius: '50%',
                background: TAG_COLORS[currentTab.tag],
              }} />

              {activeNote && ['exam','planner','tutor','flashcards','mindmap'].includes(tab) && (
                <span style={{
                  fontFamily: ibm,
                  fontSize: 10,
                  border: '1px solid rgba(251,255,72,0.25)',
                  color: '#FBFF48',
                  padding: '3px 10px',
                  letterSpacing: '0.06em',
                }}>
                  {activeNote.title}
                </span>
              )}
            </div>

            {/* Right: theme toggle + user + live indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

              {/* ── DARK / LIGHT TOGGLE ── */}
              <div style={{
                display: 'flex',
                background: tok.togBg,
                border: `1px solid ${tok.togBorder}`,
                padding: 2,
                gap: 2,
                transition: 'background 0.4s, border-color 0.4s',
              }}>
                {(['dark', 'light'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setDark(mode === 'dark')}
                    style={{
                      fontFamily: mono,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      padding: '4px 9px',
                      border: 'none',
                      cursor: 'pointer',
                      background: (dark ? 'dark' : 'light') === mode
                        ? '#FBFF48'
                        : 'transparent',
                      color: (dark ? 'dark' : 'light') === mode
                        ? '#000'
                        : tok.fgDim,
                      transition: 'background 0.25s, color 0.25s',
                    }}
                  >
                    {mode === 'dark' ? '◐ DARK' : '○ LIGHT'}
                  </button>
                ))}
              </div>

              {/* Username */}
              <span style={{
                fontFamily: ibm,
                fontSize: 11,
                color: tok.fgDim,
                transition: 'color 0.4s',
              }}>
                {user?.name?.split(' ')[0].toUpperCase()}
              </span>

              {/* Live indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: '#4ADE80',
                  boxShadow: '0 0 6px #4ADE80',
                }} />
                <span style={{
                  fontFamily: mono,
                  fontSize: 9,
                  color: tok.fgDim,
                  letterSpacing: '0.1em',
                  transition: 'color 0.4s',
                }}>LIVE</span>
              </div>
            </div>
          </div>

          {/* ── Content area ── */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            background: tok.bg,
            transition: 'background 0.4s',
          }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.16 }}
                >
                  {(user as any)?.isDemo && <DemoModeBanner dark={dark} />}
                  {tab === 'upload'     && <UploadNote />}
                  {tab === 'notes'      && <NotesList onSendToAI={handleSendToAI} />}
                  {tab === 'search'     && <SearchBar />}
                  {tab === 'flashcards' && <Flashcards preloadContent={activeNote?.content} />}
                  {tab === 'mindmap'    && <MindMap preloadContent={activeNote?.content} />}
                  {tab === 'class'      && <ClassHub />}
                  {tab === 'profile'    && <Profile />}
                  {tab === 'exam'       && <ExamPredictor preloadContent={activeNote?.content || ''} preloadSubject={activeNote?.subject || ''} />}
                  {tab === 'planner'    && <StudyPlanner preloadSubject={activeNote?.subject || ''} />}
                  {tab === 'tutor'      && <AiTutor preloadSubject={activeNote?.subject || ''} />}
                  {tab === 'reminders'  && <RevisionReminders />}
                  {tab === 'whatsapp'   && <WhatsAppBot />}
                  {tab === 'vault'      && <FileVault dark={dark} />}
                  {tab === 'analytics'  && <PerformanceDashboard dark={dark} />}
                  {tab === 'copilot'    && <StudyCopilot dark={dark} />}
                  {tab === 'group'      && <GroupStudy dark={dark} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

        </main>
      </div>
    </>
  )
}
