'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Cookies from 'js-cookie';
import { apiGetNotes } from '@/lib/api'
import { fetchWithRetry, safeJson } from '@/lib/fetchWithRetry';
import { useTheme, mono, ibm } from '@/lib/useTheme';
import { SaveBar, SavedItemsPanel } from '@/components/SavedItemsPanel';

const API = process.env.NEXT_PUBLIC_API_URL?.replace('/api','') || 'http://localhost:5000';
const srcIcon = (t:string) => t==='pdf'?'PDF':t==='image'?'IMG':t==='voice'?'MIC':t==='youtube'?'YT':'TXT';
const sessionTypeColor: Record<string,string> = { study:'#60A5FA', revision:'#A78BFA', practice:'#4ADE80' };

export default function StudyPlanner({ preloadSubject = '' }: { preloadSubject?: string }) {
  const t = useTheme();
  const [subjects, setSubjects]       = useState(preloadSubject || '');
  const [examDate, setExamDate]       = useState('');
  const [dailyHours, setDailyHours]   = useState(4);
  const [weakTopics, setWeakTopics]   = useState('');
  const [plan, setPlan]               = useState<any>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [notes, setNotes]             = useState<any[]>([]);
  const [showNotes, setShowNotes]     = useState(false);
  const [loadedFrom, setLoadedFrom]   = useState('');
  const minDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  useEffect(() => { apiGetNotes().then((d:any) => setNotes(d.notes||[])).catch(()=>{}); }, []);

  const loadFromNote = (note: any) => {
    if (note.subject) setSubjects(note.subject);
    if (note.keywords?.length) setWeakTopics(note.keywords.slice(0,3).join(', '));
    setLoadedFrom(`${srcIcon(note.sourceType)} ${note.title}`);
    setShowNotes(false); setPlan(null);
  };

  /** Load a previously saved study plan */
  const handleLoadSaved = (item: any) => {
    const savedPlan = item.data?.plan ?? item.data;
    setPlan(savedPlan);
    setExpandedDay(1);
    setError('');
    // Restore subjects if stored
    if (item.subject) setSubjects(item.subject);
  };

  const generate = async () => {
    const subArr = subjects.split(',').map((s:string) => s.trim()).filter(Boolean);
    if (!subArr.length) { setError('Add at least one subject'); return; }
    if (!examDate) { setError('Select your exam date'); return; }
    setError(''); setLoading(true); setPlan(null);
    try {
      const token = Cookies.get('nn_token');
      const res = await fetchWithRetry(`${API}/api/planner/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subjects: subArr, examDate, dailyHours, weakTopics, aiModel: 'groq' }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
      setPlan(data); setExpandedDay(1);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const inp: React.CSSProperties = {
    width: '100%', background: t.inpBg, border: `1px solid ${t.inpBorder}`,
    padding: '10px 14px', color: t.inpText, fontFamily: ibm, fontSize: 13, outline: 'none',
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#A78BFA', letterSpacing: '0.15em', marginBottom: 6 }}>// AI_TOOLS</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
          STUDY<span style={{ color: '#A78BFA' }}>_PLANNER</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4 }}>AI builds a personalized revision schedule for your exam.</p>
      </div>

      {/* ── Saved plans panel ── */}
      <SavedItemsPanel type="studyplan" onLoad={handleLoadSaved} />

      <div style={{ border: `1px solid ${t.border}`, padding: 24, background: t.bg3,
                    display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
        {/* Note selector */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em' }}>// LOAD_FROM_NOTE</div>
            <button onClick={() => setShowNotes(v => !v)}
              style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', padding: '4px 10px',
                       border: `1px solid ${t.border}`, color: t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#A78BFA'; (e.currentTarget as HTMLElement).style.color = '#A78BFA' }}
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
          {loadedFrom && <div style={{ fontFamily: ibm, fontSize: 11, color: '#A78BFA' }}>● Loaded: {loadedFrom}</div>}
        </div>

        {/* Subjects */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// SUBJECTS (comma-separated) *</div>
          <input value={subjects} onChange={e => setSubjects(e.target.value)} placeholder="Physics, Maths, History"
            style={inp}
            onFocus={e => e.currentTarget.style.borderColor = '#A78BFA'}
            onBlur={e => e.currentTarget.style.borderColor = t.inpBorder} />
        </div>

        {/* Exam date */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// EXAM_DATE *</div>
          <input type="date" value={examDate} min={minDate} onChange={e => setExamDate(e.target.value)}
            style={{ ...inp, colorScheme: t.dark ? 'dark' : 'light' }}
            onFocus={e => e.currentTarget.style.borderColor = '#A78BFA'}
            onBlur={e => e.currentTarget.style.borderColor = t.inpBorder} />
        </div>

        {/* Daily hours */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// DAILY_HOURS: {dailyHours}h</div>
          <input type="range" min={1} max={12} value={dailyHours} onChange={e => setDailyHours(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#A78BFA' }} />
        </div>

        {/* Weak topics */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// WEAK_TOPICS (optional)</div>
          <input value={weakTopics} onChange={e => setWeakTopics(e.target.value)} placeholder="e.g. Integration, Thermodynamics"
            style={inp}
            onFocus={e => e.currentTarget.style.borderColor = '#A78BFA'}
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
        style={{ width: '100%', background: '#A78BFA', color: '#000', border: 'none', padding: '13px',
                 fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                 opacity: loading ? 0.6 : 1, cursor: 'pointer', marginBottom: 28 }}>
        {loading ? 'GENERATING PLAN...' : 'GENERATE_STUDY_PLAN →'}
      </motion.button>

      {plan && (
        <div>
          {plan.summary && (
            <div style={{ border: '1px solid rgba(167,139,250,0.3)', padding: 16, marginBottom: 20,
                          background: t.dark ? 'rgba(167,139,250,0.06)' : 'rgba(167,139,250,0.08)' }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: '#A78BFA', letterSpacing: '0.12em', marginBottom: 8 }}>// PLAN_SUMMARY</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                {[['DAYS', plan.summary.totalDays],['HOURS', plan.summary.totalHours],['SUBJECTS', plan.summary.subjects?.join(', ')]].map(([l,v]) => (
                  <div key={l as string} style={{ fontFamily: mono, fontSize: 9, padding: '4px 12px',
                                                  border: `1px solid ${t.border}`, color: t.fgDim, letterSpacing: '0.08em',
                                                  background: t.dark ? t.bg2 : t.bg }}>
                    {l}: {v}
                  </div>
                ))}
              </div>
              {plan.summary.strategy && <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, lineHeight: 1.7 }}>{plan.summary.strategy}</div>}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: t.cardBg }}>
            {plan.dailyPlan?.map((day: any) => (
              <div key={day.day} style={{
                background: t.bg2,
                borderLeft: expandedDay===day.day ? '2px solid #A78BFA' : `2px solid ${t.border}`,
                transition: 'border-color 0.18s',
              }}>
                <button onClick={() => setExpandedDay(expandedDay===day.day ? null : day.day)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                           padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: '#A78BFA', letterSpacing: '0.08em', flexShrink: 0 }}>DAY_{day.day}</span>
                  <span style={{ fontFamily: ibm, fontSize: 13, color: t.fg, flex: 1 }}>{day.date}</span>
                  <span style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.08em' }}>{day.sessions?.length||0} SESSIONS</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: t.fgMuted }}>{expandedDay===day.day?'▲':'▼'}</span>
                </button>
                <AnimatePresence>
                  {expandedDay===day.day && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 16px 16px 16px' }}>
                        {day.sessions?.map((s: any, si: number) => (
                          <div key={si} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0',
                                                 borderBottom: si<day.sessions.length-1 ? `1px solid ${t.borderSub}` : 'none' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: sessionTypeColor[s.type]||t.fgMuted, marginTop: 8, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontFamily: mono, fontSize: 9, color: sessionTypeColor[s.type]||t.fgDim, letterSpacing: '0.08em' }}>{s.type?.toUpperCase()}</span>
                                <span style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>{s.duration}min</span>
                              </div>
                              <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg, marginBottom: 3 }}>{s.subject}</div>
                              {s.topic && <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim }}>{s.topic}</div>}
                              {s.description && <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgMuted, marginTop: 4, lineHeight: 1.6 }}>{s.description}</div>}
                            </div>
                          </div>
                        ))}
                        {day.totalHours && <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, marginTop: 10, letterSpacing: '0.08em' }}>TOTAL: {day.totalHours}h</div>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* ── Save bar ── */}
          <SaveBar
            type="studyplan"
            data={{ plan }}
            subject={subjects.split(',')[0]?.trim() || ''}
            defaultName={`Study Plan – ${subjects.split(',')[0]?.trim() || 'Plan'}`}
          />
        </div>
      )}
    </div>
  );
}
