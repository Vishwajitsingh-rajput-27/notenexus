'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { apiSearch } from '@/lib/api'
import { useTheme, mono, ibm } from '@/lib/useTheme'

const EXAMPLES = ["What are Newton's Laws?","Explain photosynthesis","Key dates in WW2","What is the quadratic formula?","Explain osmosis and diffusion"]
const SOURCE_LABELS: Record<string,string> = { pdf:'PDF', image:'IMG', youtube:'YT', voice:'MIC', whatsapp:'WA' }
const scoreColor = (s: number) => s > 0.85 ? '#4ADE80' : s > 0.70 ? '#FBFF48' : '#aaaaaa'

export default function SearchBar() {
  const t = useTheme()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  const search = async (q?: string) => {
    const qStr = q ?? query
    if (!qStr.trim()) return
    setQuery(qStr); setLoading(true); setDone(true)
    try { const data = await apiSearch(qStr); setResults(data.results || []) }
    catch { toast.error('Search failed') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#FBFF48', letterSpacing: '0.15em', marginBottom: 6 }}>// SEARCH_ENGINE</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
          SEMANTIC<span style={{ color: '#FBFF48' }}>_SEARCH</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4 }}>Ask anything in plain English — powered by vector search.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="e.g. What did I note about osmosis?"
          style={{ flex: 1, background: t.inpBg, border: `1px solid ${t.inpBorder}`, padding: '11px 14px', color: t.inpText, fontFamily: ibm, fontSize: 13, outline: 'none', transition: 'border-color 0.2s' }}
          onFocus={e => e.currentTarget.style.borderColor = '#FBFF48'}
          onBlur={e  => e.currentTarget.style.borderColor = t.inpBorder}
        />
        <motion.button whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
          onClick={() => search()} disabled={loading || !query.trim()}
          style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', padding: '0 20px', background: '#FBFF48', color: '#000', border: 'none', cursor: 'pointer', opacity: (loading || !query.trim()) ? 0.4 : 1 }}>
          {loading ? '...' : 'SEARCH'}
        </motion.button>
      </div>

      {!done && (
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// TRY_THESE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => search(ex)}
                style={{ fontFamily: ibm, fontSize: 11, padding: '5px 12px', border: `1px solid ${t.border}`, color: t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FBFF48'; (e.currentTarget as HTMLElement).style.color = '#FBFF48' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.border; (e.currentTarget as HTMLElement).style.color = t.fgDim }}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {done && !loading && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 12, marginTop: 24 }}>
              // {results.length} RESULT{results.length !== 1 ? 'S' : ''} FOR "{query.toUpperCase()}"
            </div>
            {results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontFamily: ibm, fontSize: 13, color: t.fgDim }}>No matches — try uploading more notes first.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: t.cardBg }}>
                {results.map((r, i) => (
                  <motion.div key={i} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.04 }}
                    style={{ background: t.bg2, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: '#FBFF48', border: '1px solid rgba(251,255,72,0.3)', padding: '2px 7px', letterSpacing: '0.1em', flexShrink: 0 }}>
                      {SOURCE_LABELS[r.metadata?.sourceType] || 'TXT'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.metadata?.title || 'Untitled'}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {r.metadata?.subject && <span style={{ fontFamily: mono, fontSize: 9, color: '#60A5FA', border: '1px solid rgba(96,165,250,0.25)', padding: '1px 7px' }}>{r.metadata.subject}</span>}
                        {r.metadata?.chapter && <span style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, border: `1px solid ${t.borderSub}`, padding: '1px 7px' }}>{r.metadata.chapter}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: scoreColor(r.score) }}>{(r.score * 100).toFixed(0)}%</span>
                      {r.metadata?.fileUrl?.startsWith('http') && (
                        <a href={r.metadata.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, textDecoration: 'none' }}>↗</a>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
