'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { apiGetNotes, apiGetSubjects, apiDeleteNote, apiShareNote } from '@/lib/api'
import { useSocket } from '@/hooks/useSocket'
import { useTheme, mono, ibm } from '@/lib/useTheme'

const SOURCE_LABELS: Record<string,string> = { pdf:'PDF', image:'IMG', youtube:'YT', voice:'MIC', whatsapp:'WA', text:'TXT' }
const AI_ACTIONS = [
  { label: 'EXAM_PRED',  tab: 'exam'       },
  { label: 'STUDY_PLAN', tab: 'planner'    },
  { label: 'AI_TUTOR',   tab: 'tutor'      },
  { label: 'FLASHCARDS', tab: 'flashcards' },
  { label: 'MIND_MAP',   tab: 'mindmap'    },
]

interface NotesListProps { onSendToAI?: (tab: string, note: any) => void }

export default function NotesList({ onSendToAI }: NotesListProps) {
  const t = useTheme()
  const [notes, setNotes]       = useState<any[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [filter, setFilter]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const socket = useSocket()

  const load = async () => {
    setLoading(true)
    try {
      const [n, s] = await Promise.all([apiGetNotes(filter || undefined), apiGetSubjects()])
      setNotes(n.notes || []); setSubjects(s.subjects || [])
    } catch { toast.error('Could not load notes') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filter])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return
    try { await apiDeleteNote(id); setNotes(p => p.filter(n => n._id !== id)); toast.success('Deleted') }
    catch { toast.error('Delete failed') }
  }

  const handleShare = async (id: string, current: boolean) => {
    try {
      await apiShareNote(id, !current)
      setNotes(p => p.map(n => n._id === id ? { ...n, isShared: !current } : n))
      toast.success(!current ? 'Shared!' : 'Unshared')
      if (!current && socket) {
        const note = notes.find(n => n._id === id)
        socket.emit('new-shared-note', { title: note?.title, subject: note?.subject, userName: 'You' })
      }
    } catch { toast.error('Failed') }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: t.accent, letterSpacing: '0.15em', marginBottom: 6 }}>// MY_NOTES</div>
          <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
            NOTE<span style={{ color: t.accent }}>_LOG</span>
          </h2>
          <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4 }}>{notes.length} notes saved</div>
        </div>
        <button onClick={load} style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, background: 'none', border: `1px solid ${t.border}`, padding: '6px 12px', cursor: 'pointer', letterSpacing: '0.08em', transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = t.fg)}
          onMouseLeave={e => (e.currentTarget.style.color = t.fgDim)}>
          ↻ REFRESH
        </button>
      </div>

      {subjects.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
          {['', ...subjects].map(s => (
            <button key={s || 'all'} onClick={() => setFilter(s)}
              style={{
                fontFamily: mono, fontSize: 10, letterSpacing: '0.08em', padding: '5px 12px',
                background: filter === s ? t.accent : 'transparent',
                color: filter === s ? '#000' : t.fgDim,
                border: `1px solid ${filter === s ? t.accent : t.border}`,
                cursor: 'pointer', transition: 'all 0.18s',
              }}>
              {s || 'ALL'}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 72, border: `1px solid ${t.borderSub}`, background: t.cardBg }} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: t.fgMuted, letterSpacing: '0.1em', marginBottom: 12 }}>// NO_NOTES_FOUND</div>
          <div style={{ fontFamily: ibm, fontSize: 13, color: t.fgDim }}>Upload your first note from the UPLOAD tab</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: t.cardBg }}>
          <AnimatePresence>
            {notes.map((note, i) => (
              <motion.div key={note._id}
                initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, x:-20 }}
                transition={{ delay: i * 0.03 }}
                style={{ background: t.bg2, borderLeft: expanded === note._id ? `2px solid ${t.accent}` : '2px solid transparent', transition: 'border-color 0.2s' }}>

                <div onClick={() => setExpanded(expanded === note._id ? null : note._id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: '#FBFF48', border: '1px solid rgba(251,255,72,0.3)', padding: '2px 7px', letterSpacing: '0.1em', flexShrink: 0 }}>
                    {SOURCE_LABELS[note.sourceType] || 'TXT'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: mono, fontSize: 9, color: '#60A5FA', border: '1px solid rgba(96,165,250,0.25)', padding: '1px 7px', letterSpacing: '0.08em' }}>{note.subject}</span>
                      <span style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, border: `1px solid ${t.borderSub}`, padding: '1px 7px', letterSpacing: '0.08em' }}>{note.chapter}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); handleShare(note._id, note.isShared) }}
                      style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', padding: '4px 10px', border: `1px solid ${note.isShared ? '#4ADE80' : t.border}`, color: note.isShared ? '#4ADE80' : t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}>
                      {note.isShared ? 'SHARED' : 'SHARE'}
                    </button>
                    {note.fileUrl?.startsWith('http') && (
                      <a href={note.fileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, textDecoration: 'none' }}>↗</a>
                    )}
                    <button onClick={e => { e.stopPropagation(); handleDelete(note._id) }}
                      style={{ fontFamily: mono, fontSize: 10, color: t.fgMuted, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#FF3B3B')}
                      onMouseLeave={e => (e.currentTarget.style.color = t.fgMuted)}>✕</button>
                    <span style={{ fontFamily: mono, fontSize: 10, color: t.fgMuted }}>{expanded === note._id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expanded === note._id && (
                  <div style={{ borderTop: `1px solid ${t.borderSub}`, padding: '16px 16px 20px' }}>
                    {note.keywords?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// KEYWORDS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {note.keywords.map((k: string) => (
                            <span key={k} style={{ fontFamily: ibm, fontSize: 11, padding: '3px 10px', border: '1px solid rgba(251,255,72,0.2)', color: 'rgba(251,255,72,0.7)' }}>{k}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(note.content || note.rawText || note.summary) && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// PREVIEW</div>
                        <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, padding: '10px 14px', background: t.inpBg, border: `1px solid ${t.borderSub}`, lineHeight: 1.7 }}>
                          {(note.content || note.rawText || note.summary || '').slice(0, 300)}...
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// SEND_TO_AI</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {AI_ACTIONS.map(action => (
                          <button key={action.tab}
                            onClick={e => { e.stopPropagation(); if (onSendToAI) { onSendToAI(action.tab, note); toast.success(`Opening ${action.tab}...`) } }}
                            style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', padding: '5px 12px', border: `1px solid ${t.border}`, color: t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FBFF48'; (e.currentTarget as HTMLElement).style.color = '#FBFF48' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.border; (e.currentTarget as HTMLElement).style.color = t.fgDim }}>
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
