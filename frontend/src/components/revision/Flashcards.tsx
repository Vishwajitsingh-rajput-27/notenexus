'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { apiRevision, apiGetNotes, apiGetNote } from '@/lib/api'
import { useTheme, mono, ibm } from '@/lib/useTheme'
import { SaveBar, SavedItemsPanel } from '@/components/SavedItemsPanel'

type Mode = 'flashcards' | 'questions'
const sourceIcon = (t: string) => t==='pdf'?'PDF':t==='image'?'IMG':t==='voice'?'MIC':t==='youtube'?'YT':'TXT'

export default function Flashcards({ preloadContent = '' }: { preloadContent?: string }) {
  const t = useTheme()
  const [text, setText]       = useState(preloadContent)
  const [mode, setMode]       = useState<Mode>('flashcards')
  const [cards, setCards]     = useState<any[]>([])
  const [idx, setIdx]         = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showAns, setShowAns] = useState(false)
  const [notes, setNotes]     = useState<any[]>([])
  const [selectedNote, setSelectedNote] = useState('')
  const [loadedFrom, setLoadedFrom]     = useState('')
  const [subject, setSubject]           = useState('')

  const sel: React.CSSProperties = { width: '100%', background: t.inpBg, border: `1px solid ${t.inpBorder}`, padding: '10px 14px', color: t.inpText, fontFamily: ibm, fontSize: 12, outline: 'none' }

  useEffect(() => { if (preloadContent) { setText(preloadContent); setSelectedNote(''); setLoadedFrom('') } }, [preloadContent])
  useEffect(() => { apiGetNotes().then((d: any) => setNotes(d.notes || [])).catch(() => {}) }, [])

  const loadFromNote = async (noteId: string) => {
    if (!noteId) { setText(''); setSelectedNote(''); setLoadedFrom(''); setSubject(''); return }
    setSelectedNote(noteId)
    try {
      const d = await apiGetNote(noteId)
      setText(d.content || '')
      setSubject(d.subject || '')
      setLoadedFrom(`${sourceIcon(d.sourceType)} ${d.title}`)
      toast.success(`Loaded: ${d.title}`)
    } catch { toast.error('Could not load note') }
  }

  const generate = async () => {
    if (!text.trim()) { toast.error('Paste notes or load a saved note'); return }
    setLoading(true)
    try {
      const d = await apiRevision(text, mode)
      setCards(Array.isArray(d.result) ? d.result : [])
      setIdx(0); setFlipped(false); setShowAns(false)
      toast.success(`${d.result?.length || 0} ${mode} generated!`)
    }
    catch (err: any) {
      // Surface the actual backend error (GROQ key missing, text too short, auth, etc.)
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error   ||
        err?.message                 ||
        'Generation failed — check your API keys and try again'
      toast.error(msg)
    }
    finally { setLoading(false) }
  }

  /** Load saved flashcard set */
  const handleLoadSaved = (item: any) => {
    const { cards: savedCards, mode: savedMode } = item.data
    if (Array.isArray(savedCards)) { setCards(savedCards); setIdx(0); setFlipped(false); setShowAns(false) }
    if (savedMode) setMode(savedMode)
    setSubject(item.subject || '')
  }

  /** Load saved practice Q&A set */
  const handleLoadSavedQA = (item: any) => {
    const { questions: savedQs, cards: savedCards } = item.data
    const loaded = savedQs ?? savedCards
    if (Array.isArray(loaded)) { setCards(loaded); setIdx(0); setFlipped(false); setShowAns(false) }
    setMode('questions')
    setSubject(item.subject || '')
  }

  const next = () => { setIdx(i => Math.min(cards.length-1,i+1)); setFlipped(false); setShowAns(false) }
  const prev = () => { setIdx(i => Math.max(0,i-1)); setFlipped(false); setShowAns(false) }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#4ADE80', letterSpacing: '0.15em', marginBottom: 6 }}>// REVISION_TOOLS</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
          REVISION<span style={{ color: '#4ADE80' }}>_CARDS</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4 }}>Generate flashcards or Q&A from any uploaded note.</p>
      </div>

      <SavedItemsPanel type="flashcards" label="FLASHCARD" onLoad={handleLoadSaved} />
      <SavedItemsPanel type="quiz" onLoad={handleLoadSavedQA} />

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {(['flashcards','questions'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '7px 16px', background: mode===m ? '#4ADE80' : 'transparent', color: mode===m ? '#000' : t.fgDim, border: `1px solid ${mode===m ? '#4ADE80' : t.inpBorder}`, cursor: 'pointer', transition: 'all 0.18s' }}>
            {m === 'flashcards' ? 'FLASHCARDS' : 'PRACTICE_QA'}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// LOAD_FROM_NOTE</div>
        <select value={selectedNote} onChange={e => loadFromNote(e.target.value)} style={sel}>
          <option value="">— Select a saved note —</option>
          {notes.map(n => <option key={n._id} value={n._id}>{sourceIcon(n.sourceType)} {n.title} · {n.subject}</option>)}
        </select>
        {loadedFrom && <div style={{ fontFamily: ibm, fontSize: 11, color: '#4ADE80', marginTop: 6 }}>● Loaded: {loadedFrom}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
        <div style={{ flex: 1, height: 1, background: t.border }} />
        <span style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.1em' }}>OR PASTE MANUALLY</span>
        <div style={{ flex: 1, height: 1, background: t.border }} />
      </div>

      <textarea value={text} onChange={e => { setText(e.target.value); setSelectedNote(''); setLoadedFrom('') }}
        placeholder="Paste your notes here…"
        style={{ ...sel, height: 120, resize: 'none', display: 'block', marginBottom: 16, lineHeight: 1.7 }}
        onFocus={e => e.currentTarget.style.borderColor = '#4ADE80'}
        onBlur={e  => e.currentTarget.style.borderColor = t.inpBorder}
      />

      <motion.button onClick={generate} disabled={loading || !text.trim()} whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
        style={{ width: '100%', background: '#4ADE80', color: '#000', border: 'none', padding: '13px', fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', opacity: (loading||!text.trim()) ? 0.5 : 1, marginBottom: 24, cursor: 'pointer' }}>
        {loading ? 'GENERATING...' : `GENERATE_${mode.toUpperCase()} →`}
      </motion.button>

      <AnimatePresence>
        {cards.length > 0 && (
          <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, letterSpacing: '0.08em' }}>CARD_{idx+1}_OF_{cards.length}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {cards.map((_,i) => (
                  <button key={i} onClick={() => { setIdx(i); setFlipped(false); setShowAns(false) }}
                    style={{ width: 20, height: 4, background: i===idx ? '#4ADE80' : t.border, border: 'none', cursor: 'pointer', transition: 'background 0.18s' }} />
                ))}
              </div>
              {mode==='flashcards' && <span style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>CLICK TO FLIP</span>}
            </div>

            {mode === 'flashcards' ? (
              <div className="flip-card" style={{ height: 220, width: '100%', cursor: 'pointer' }} onClick={() => setFlipped(f => !f)}>
                <div className={`flip-inner w-full h-full ${flipped ? 'flipped' : ''}`}>
                  <div className="flip-front" style={{ width:'100%', height:'100%', border: `1px solid ${t.border}`, background: t.bg2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#4ADE80', letterSpacing: '0.15em', marginBottom: 16 }}>// QUESTION</div>
                    <p style={{ fontFamily: ibm, fontSize: 16, textAlign: 'center', lineHeight: 1.7, color: t.fg }}>{cards[idx]?.question}</p>
                  </div>
                  <div className="flip-back" style={{ width:'100%', height:'100%', border: '1px solid #4ADE80', background: t.dark ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#4ADE80', letterSpacing: '0.15em', marginBottom: 16 }}>// ANSWER</div>
                    <p style={{ fontFamily: ibm, fontSize: 16, textAlign: 'center', lineHeight: 1.7, color: t.fg }}>{cards[idx]?.answer}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ border: `1px solid ${t.border}`, padding: 24, background: t.bg2, minHeight: 160 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#4ADE80', letterSpacing: '0.15em', marginBottom: 12 }}>// QUESTION_{idx+1} — {cards[idx]?.type?.toUpperCase()}</div>
                <p style={{ fontFamily: ibm, fontSize: 15, color: t.fg, marginBottom: 16, lineHeight: 1.7 }}>{cards[idx]?.question}</p>
                {cards[idx]?.hint && !showAns && <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, fontStyle: 'italic' }}>HINT: {cards[idx].hint}</p>}
                <button onClick={() => setShowAns(s => !s)} style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', transition: 'color 0.18s', marginTop: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#4ADE80')}
                  onMouseLeave={e => (e.currentTarget.style.color = t.fgDim)}>
                  {showAns ? '▲ HIDE_ANSWER' : '▼ SHOW_ANSWER'}
                </button>
                <AnimatePresence>
                  {showAns && (
                    <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                      style={{ overflow:'hidden', borderTop: `1px solid ${t.border}`, marginTop: 12, paddingTop: 12 }}>
                      <p style={{ fontFamily: ibm, fontSize: 13, color: '#4ADE80', lineHeight: 1.7 }}>{cards[idx]?.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={prev} disabled={idx===0} style={{ flex: 1, fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '11px', border: `1px solid ${t.border}`, background: 'none', color: idx===0 ? t.fgMuted : t.fg, cursor: idx===0 ? 'default' : 'pointer', transition: 'all 0.18s' }}>← PREV</button>
              <button onClick={next} disabled={idx===cards.length-1} style={{ flex: 1, fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '11px', border: '1px solid #4ADE80', background: idx===cards.length-1 ? 'transparent' : 'rgba(74,222,128,0.1)', color: idx===cards.length-1 ? t.fgMuted : '#4ADE80', cursor: idx===cards.length-1 ? 'default' : 'pointer', transition: 'all 0.18s' }}>NEXT →</button>
            </div>

            {/* ── Save bar ── */}
            <SaveBar
              type={mode === 'questions' ? 'quiz' : 'flashcards'}
              data={mode === 'questions' ? { questions: cards, subject, level: '' } : { cards, mode }}
              subject={subject}
              defaultName={`${mode === 'flashcards' ? 'Flashcards' : 'Q&A'} – ${subject || 'Set'}`}
            />

            <button onClick={() => { setCards([]); setIdx(0); setFlipped(false) }} style={{ width: '100%', marginTop: 8, fontFamily: mono, fontSize: 10, color: t.fgMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '8px', letterSpacing: '0.08em', transition: 'color 0.18s' }}
              onMouseEnter={e => (e.currentTarget.style.color = t.fg)}
              onMouseLeave={e => (e.currentTarget.style.color = t.fgMuted)}>
              ↻ GENERATE_NEW_SET
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
