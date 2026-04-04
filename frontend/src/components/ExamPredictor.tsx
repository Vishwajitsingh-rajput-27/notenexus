'use client';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Cookies from 'js-cookie';
import { apiGetNotes, apiGetNote } from '@/lib/api'
import { fetchWithRetry, safeJson } from '@/lib/fetchWithRetry';
import { useTheme, mono, ibm } from '@/lib/useTheme';
import { SaveBar, SavedItemsPanel } from '@/components/SavedItemsPanel';

const API = process.env.NEXT_PUBLIC_API_URL?.replace('/api','') || 'http://localhost:5000';
const srcIcon = (t:string) => t==='pdf'?'PDF':t==='image'?'IMG':t==='voice'?'MIC':t==='youtube'?'YT':'TXT';
const diffColor: Record<string,string> = { Easy:'#4ADE80', Medium:'#d97706', Hard:'#FF3B3B' };

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => { if (ref.current) setHeight(ref.current.scrollHeight); }, [open, children]);
  return (
    <motion.div animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }} initial={false} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}

export default function ExamPredictor({ preloadContent='', preloadSubject='' }: { preloadContent?:string; preloadSubject?:string }) {
  const t = useTheme();
  const [noteContent, setNoteContent] = useState(preloadContent);
  const [subject, setSubject]         = useState(preloadSubject);
  const [examType, setExamType]       = useState('mixed');
  const [count, setCount]             = useState(10);
  const [questions, setQuestions]     = useState<any[]>([]);
  const [meta, setMeta]               = useState<any>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [subjects, setSubjects]       = useState<string[]>([]);
  const [openIdx, setOpenIdx]         = useState<number | null>(null);
  const [notes, setNotes]             = useState<any[]>([]);
  const [showNotes, setShowNotes]     = useState(false);
  const [loadedFrom, setLoadedFrom]   = useState('');

  useEffect(() => { if (preloadContent) setNoteContent(preloadContent); }, [preloadContent]);
  useEffect(() => { if (preloadSubject) setSubject(preloadSubject); }, [preloadSubject]);
  useEffect(() => { apiGetNotes().then((d:any) => setNotes(d.notes||[])).catch(()=>{}); }, []);
  useEffect(() => {
    const token = Cookies.get('nn_token');
    fetchWithRetry(`${API}/api/notes/subjects`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => safeJson(r)).then(d => setSubjects(d.subjects||[])).catch(()=>{});
  }, []);

  const loadFromNote = async (note: any) => {
    try {
      const d = await apiGetNote(note._id);
      setNoteContent(d.content||''); setSubject(note.subject||'');
      setLoadedFrom(`${srcIcon(note.sourceType)} ${note.title}`); setShowNotes(false);
    } catch {}
  };

  /** Load a previously saved exam question set */
  const handleLoadSaved = (item: any) => {
    const { questions: qs, meta: m } = item.data;
    if (qs) { setQuestions(qs); setOpenIdx(null); }
    if (m)  setMeta(m);
    if (item.subject) setSubject(item.subject);
    setError('');
  };

  const generate = async () => {
    setError(''); setLoading(true); setQuestions([]); setMeta(null);
    try {
      const token = Cookies.get('nn_token');
      const res = await fetchWithRetry(`${API}/api/exam/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ noteContent, subject, examType, count, aiModel: 'groq' }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
      setQuestions(data.questions||[]); setMeta(data.meta||null);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const EXAM_TYPES = ['multiple_choice','short_answer','long_answer','mixed'];

  const inp: React.CSSProperties = {
    width:'100%', background: t.inpBg, border: `1px solid ${t.inpBorder}`,
    padding:'10px 14px', color: t.inpText, fontFamily: ibm, fontSize:13, outline:'none',
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#F97316', letterSpacing: '0.15em', marginBottom: 6 }}>// AI_TOOLS</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
          EXAM<span style={{ color: '#F97316' }}>_PREDICTOR</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4 }}>Generate likely exam questions from your notes using AI.</p>
      </div>

      {/* ── Saved exam question sets ── */}
      <SavedItemsPanel type="examquestions" onLoad={handleLoadSaved} />

      <div style={{ border: `1px solid ${t.border}`, padding: 24, background: t.bg3,
                    display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
        {/* Note selector */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em' }}>// LOAD_FROM_NOTE</div>
            <button onClick={() => setShowNotes(v => !v)}
              style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', padding: '4px 10px',
                       border: `1px solid ${t.border}`, color: t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#F97316'; (e.currentTarget as HTMLElement).style.color = '#F97316' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.border; (e.currentTarget as HTMLElement).style.color = t.fgDim }}>
              SELECT_NOTE {showNotes ? '▲' : '▼'}
            </button>
          </div>
          {showNotes && (
            <div style={{ border: `1px solid ${t.borderSub}`, maxHeight: 160, overflowY: 'auto', background: t.bg2, marginBottom: 8 }}>
              {notes.map(note => (
                <button key={note._id} onClick={() => loadFromNote(note)}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none',
                           border: 'none', borderBottom: `1px solid ${t.borderSub}`, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = t.inpBg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <div style={{ fontFamily: ibm, fontSize: 12, color: t.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, marginTop: 2 }}>{note.subject}</div>
                </button>
              ))}
            </div>
          )}
          {loadedFrom && <div style={{ fontFamily: ibm, fontSize: 11, color: '#F97316' }}>● Loaded: {loadedFrom}</div>}
        </div>

        {/* Subject */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// SUBJECT</div>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Physics, History"
            style={inp}
            onFocus={e => e.currentTarget.style.borderColor = '#F97316'}
            onBlur={e => e.currentTarget.style.borderColor = t.inpBorder} />
          {subjects.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              {subjects.map(s => (
                <button key={s} onClick={() => setSubject(s)}
                  style={{ fontFamily: mono, fontSize: 9, padding: '3px 10px',
                           border: `1px solid ${subject===s ? '#F97316' : t.border}`,
                           color: subject===s ? '#F97316' : t.fgDim,
                           background: subject===s ? (t.dark ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.12)') : 'none',
                           cursor: 'pointer', transition: 'all 0.18s' }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Exam type */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// EXAM_TYPE</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {EXAM_TYPES.map(type => (
              <button key={type} onClick={() => setExamType(type)}
                style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                         padding: '6px 12px', textTransform: 'uppercase',
                         background: examType===type ? '#F97316' : 'transparent',
                         color: examType===type ? '#fff' : t.fgDim,
                         border: `1px solid ${examType===type ? '#F97316' : t.border}`,
                         cursor: 'pointer', transition: 'all 0.18s' }}>
                {type.replace('_',' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// QUESTION_COUNT: {count}</div>
          <input type="range" min={3} max={20} value={count} onChange={e => setCount(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#F97316' }} />
        </div>

        {/* Note content */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// NOTE_CONTENT (optional)</div>
          <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)}
            placeholder="Paste note content or load from a saved note…"
            style={{ ...inp, height: 100, resize: 'none', display: 'block', lineHeight: 1.7 }}
            onFocus={e => e.currentTarget.style.borderColor = '#F97316'}
            onBlur={e => e.currentTarget.style.borderColor = t.inpBorder} />
        </div>
      </div>

      {error && (
        <div style={{ fontFamily: ibm, fontSize: 12, color: '#FF3B3B',
                      padding: '8px 12px', border: '1px solid rgba(255,59,59,0.25)',
                      background: t.dark ? 'rgba(255,59,59,0.05)' : 'rgba(255,59,59,0.07)',
                      marginBottom: 16 }}>
          {error}
        </div>
      )}

      <motion.button onClick={generate} disabled={loading} whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
        style={{ width: '100%', background: '#F97316', color: '#fff', border: 'none', padding: '13px',
                 fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                 opacity: loading ? 0.6 : 1, cursor: 'pointer', marginBottom: 28 }}>
        {loading ? 'GENERATING...' : 'PREDICT_EXAM_QUESTIONS →'}
      </motion.button>

      {questions.length > 0 && (
        <div>
          {meta && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {[['SUBJECT', meta.subject],['DIFFICULTY', meta.difficulty],['COUNT', questions.length]].map(([l,v]) => (
                <div key={l as string} style={{ fontFamily: mono, fontSize: 9, padding: '4px 12px',
                                                border: `1px solid ${t.border}`, color: t.fgDim,
                                                letterSpacing: '0.08em',
                                                background: t.dark ? t.bg2 : t.bg }}>
                  {l}: {v}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: t.cardBg }}>
            {questions.map((q: any, i: number) => (
              <div key={i} style={{
                background: t.bg2,
                borderLeft: openIdx===i ? `2px solid ${diffColor[q.difficulty]||'#F97316'}` : `2px solid ${t.border}`,
                transition: 'border-color 0.18s',
              }}>
                <button onClick={() => setOpenIdx(openIdx===i ? null : i)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                           padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: diffColor[q.difficulty]||t.fgDim,
                                 border: `1px solid ${diffColor[q.difficulty]||t.border}`,
                                 background: t.dark
                                   ? `${diffColor[q.difficulty] || t.border}15`
                                   : `${diffColor[q.difficulty] || t.border}18`,
                                 padding: '2px 8px', flexShrink: 0 }}>
                    {q.difficulty||'—'}
                  </span>
                  <span style={{ fontFamily: ibm, fontSize: 13, color: t.fg, flex: 1,
                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.question}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: t.fgMuted }}>
                    {openIdx===i?'▲':'▼'}
                  </span>
                </button>
                <Collapsible open={openIdx===i}>
                  <div style={{ padding: '0 16px 16px 16px', paddingLeft: 54 }}>
                    {q.type && (
                      <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted,
                                    letterSpacing: '0.1em', marginBottom: 10 }}>
                        TYPE: {q.type.toUpperCase().replace('_',' ')}
                      </div>
                    )}
                    {q.options && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                        {q.options.map((opt: string) => (
                          <div key={opt} style={{
                            fontFamily: ibm, fontSize: 12,
                            padding: '6px 12px',
                            border: `1px solid ${opt===q.answer ? 'rgba(74,222,128,0.4)' : t.borderSub}`,
                            color: opt===q.answer ? '#4ADE80' : t.fgDim,
                            background: opt===q.answer
                              ? (t.dark ? 'rgba(74,222,128,0.07)' : 'rgba(74,222,128,0.10)')
                              : 'transparent',
                          }}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    {q.answer && (
                      <div style={{ fontFamily: ibm, fontSize: 12, color: '#4ADE80',
                                    padding: '8px 12px',
                                    border: '1px solid rgba(74,222,128,0.2)',
                                    background: t.dark ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.09)',
                                    marginBottom: 8 }}>
                        {q.answer}
                      </div>
                    )}
                    {q.explanation && (
                      <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, lineHeight: 1.7 }}>
                        {q.explanation}
                      </div>
                    )}
                    {q.marks && (
                      <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, marginTop: 8, letterSpacing: '0.08em' }}>
                        MARKS: {q.marks}
                      </div>
                    )}
                  </div>
                </Collapsible>
              </div>
            ))}
          </div>

          {/* ── Save bar ── */}
          <SaveBar
            type="examquestions"
            data={{ questions, meta }}
            subject={subject}
            defaultName={`Exam Questions – ${subject || 'Set'}`}
          />
        </div>
      )}
    </div>
  );
}
