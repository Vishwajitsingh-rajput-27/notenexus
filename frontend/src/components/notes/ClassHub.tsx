'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { apiGetSharedNotes, apiUpvoteNote } from '@/lib/api'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/lib/store'
import { useTheme, mono, ibm } from '@/lib/useTheme'

const SOURCE_LABELS: Record<string,string> = { pdf:'PDF', image:'IMG', youtube:'YT', voice:'MIC', whatsapp:'WA', text:'TXT' }

export default function ClassHub() {
  const t = useTheme()
  const [notes, setNotes]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()
  const socket   = useSocket()

  const load = async () => {
    setLoading(true)
    try { const data = await apiGetSharedNotes(); setNotes(data.notes || []) }
    catch { toast.error('Could not load shared notes') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    if (socket) {
      socket.on('upvote-update', ({ noteId, upvotes }: any) => {
        setNotes(prev => prev.map(n => n._id === noteId ? { ...n, upvotes } : n))
      })
      return () => { socket.off('upvote-update') }
    }
  }, [socket])

  const handleUpvote = async (note: any) => {
    try {
      const data = await apiUpvoteNote(note._id)
      setNotes(prev => prev.map(n => n._id === note._id ? { ...n, upvotes: data.upvotes } : n))
      socket?.emit('note-upvoted', { noteId: note._id, upvotes: data.upvotes })
      toast.success(data.upvoted ? 'Upvoted!' : 'Removed upvote')
    } catch { toast.error('Failed') }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: '#60A5FA', letterSpacing: '0.15em', marginBottom: 6 }}>// COLLABORATION_LAYER</div>
          <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
            CLASS<span style={{ color: '#60A5FA' }}>_HUB</span>
          </h2>
          <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block', boxShadow: '0 0 6px #4ADE80' }} />
            Live via Socket.io
          </div>
        </div>
        <button onClick={load} style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, background: 'none', border: `1px solid ${t.border}`, padding: '6px 12px', cursor: 'pointer', letterSpacing: '0.08em' }}
          onMouseEnter={e => (e.currentTarget.style.color = t.fg)}
          onMouseLeave={e => (e.currentTarget.style.color = t.fgDim)}>
          ↻ REFRESH
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(4)].map((_,i) => <div key={i} style={{ height: 80, border: `1px solid ${t.borderSub}`, background: t.cardBg }} />)}
        </div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: t.fgMuted, letterSpacing: '0.1em', marginBottom: 12 }}>// NO_SHARED_NOTES</div>
          <div style={{ fontFamily: ibm, fontSize: 13, color: t.fgDim }}>Be the first! Share a note from MY_NOTES tab.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: t.cardBg }}>
          <AnimatePresence>
            {notes.map((note, i) => (
              <motion.div key={note._id}
                initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.04 }}
                style={{ background: t.bg2, padding: '16px' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: '#60A5FA', border: '1px solid rgba(96,165,250,0.3)', padding: '2px 7px', letterSpacing: '0.1em', flexShrink: 0, marginTop: 2 }}>
                    {SOURCE_LABELS[note.sourceType] || 'TXT'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontFamily: mono, fontSize: 9, color: '#60A5FA', border: '1px solid rgba(96,165,250,0.25)', padding: '1px 7px' }}>{note.subject}</span>
                      <span style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, border: `1px solid ${t.borderSub}`, padding: '1px 7px' }}>{note.chapter}</span>
                    </div>
                    {note.userId?.name && <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim }}>by {note.userId.name}</div>}
                    {note.keywords?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        {note.keywords.map((k: string) => (
                          <span key={k} style={{ fontFamily: ibm, fontSize: 10, padding: '2px 8px', border: `1px solid ${t.borderSub}`, color: t.fgDim }}>{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <motion.button onClick={() => handleUpvote(note)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: mono, fontSize: 11, fontWeight: 700, padding: '6px 14px', border: `1px solid ${t.border}`, color: t.fg, background: 'none', cursor: 'pointer', transition: 'border-color 0.18s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = t.accent)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}>
                      ↑ {note.upvotes || 0}
                    </motion.button>
                    {note.fileUrl?.startsWith('http') && (
                      <a href={note.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, textDecoration: 'none' }}>↗ FILE</a>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
