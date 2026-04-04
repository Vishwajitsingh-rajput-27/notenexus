'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Cookies from 'js-cookie';
import { apiGetNotes } from '@/lib/api';
import { useTheme, mono, ibm } from '@/lib/useTheme';
import { SavedItemsPanel, SaveBar } from '@/components/SavedItemsPanel';
import { apiSaveItem } from '@/lib/api'
import { fetchWithRetry, safeJson } from '@/lib/fetchWithRetry';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL?.replace('/api','') || 'http://localhost:5000';
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const SUGGESTED = ['Explain this topic from scratch', "Give me an example", "I don't understand", 'Quiz me', "Summarise what we've covered"];

const sourceIcon = (type: string) => {
  if (type === 'pdf')     return 'PDF';
  if (type === 'image')   return 'IMG';
  if (type === 'voice')   return 'MIC';
  if (type === 'youtube') return 'YT';
  return 'TXT';
};

export default function AiTutor({ preloadSubject = '' }: { preloadSubject?: string }) {
  const t = useTheme();
  const [subject, setSubject]   = useState(preloadSubject || '');
  const [level, setLevel]       = useState('beginner');
  const [started, setStarted]   = useState(false);
  const [history, setHistory]   = useState<any[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [quiz, setQuiz]         = useState<any>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizChecked, setQuizChecked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes]           = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [showNotes, setShowNotes]   = useState(false);
  const [loadedFrom, setLoadedFrom] = useState('');

  // Save chat state
  const [saveName, setSaveName]   = useState('');
  const [showSave, setShowSave]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [savedChat, setSavedChat] = useState(false);

  // Quiz save state
  const [savedQuiz, setSavedQuiz] = useState(false);

  useEffect(() => { if (preloadSubject) setSubject(preloadSubject); }, [preloadSubject]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, loading]);
  useEffect(() => {
    setLoadingNotes(true);
    apiGetNotes().then((d: any) => setNotes(d.notes || [])).catch(() => {}).finally(() => setLoadingNotes(false));
  }, []);

  // Reset save state when history changes
  useEffect(() => { setSavedChat(false); }, [history]);
  // Reset quiz saved state when quiz changes
  useEffect(() => { setSavedQuiz(false); }, [quiz]);

  const loadFromNote = (note: any) => {
    setSubject(note.subject || note.title || '');
    setLoadedFrom(`${sourceIcon(note.sourceType)} ${note.title}`);
    setShowNotes(false);
  };

  /** Load a previously saved chat session */
  const handleLoadSaved = (item: any) => {
    const { history: h, subject: s, level: l } = item.data;
    if (h) setHistory(h);
    if (s) setSubject(s);
    if (l) setLevel(l);
    setStarted(true);
    setQuiz(null);
  };

  /** Load a previously saved quiz */
  const handleLoadSavedQuiz = (item: any) => {
    const { questions, subject: s, level: l } = item.data;
    if (questions) { setQuiz(questions); setQuizAnswers({}); setQuizChecked(false); }
    if (s) setSubject(s);
    if (l) setLevel(l);
    setStarted(true);
  };

  const saveChat = async () => {
    if (!saveName.trim()) { toast.error('Give this chat a name'); return; }
    setSaving(true);
    try {
      await apiSaveItem({ type: 'chat', name: saveName.trim(), subject, data: { history, subject, level } });
      toast.success('Chat saved!');
      setSavedChat(true);
      setShowSave(false);
    } catch { toast.error('Could not save chat'); }
    finally { setSaving(false); }
  };

  const sendMessage = async (msg = input) => {
    const text = msg.trim();
    if (!text || loading) return;
    setInput(''); setError('');
    const userMsg = { role: 'user', content: text };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    setLoading(true);
    try {
      const token = Cookies.get('nn_token');
      const res = await fetchWithRetry(`${API}/api/tutor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history, subject, level, aiModel: 'groq' }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
      setHistory([...newHistory, { role: 'assistant', content: data.reply }]);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fetchQuiz = async () => {
    if (!subject) return;
    setQuiz(null); setQuizAnswers({}); setQuizChecked(false);
    try {
      const token = Cookies.get('nn_token');
      const lastTopic = history.filter(h => h.role === 'assistant').slice(-1)[0]?.content?.slice(0, 60) || subject;
      const res = await fetchWithRetry(`${API}/api/tutor/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject, topic: lastTopic, level }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
      setQuiz(data.quiz);
    } catch (err: any) { setError(err.message); }
  };

  const score = quiz ? quiz.filter((q: any, i: number) => quizAnswers[i]?.startsWith(q.answer + ')')).length : 0;

  const inp: React.CSSProperties = {
    width: '100%', background: t.inpBg, border: `1px solid ${t.inpBorder}`,
    padding: '10px 14px', color: t.inpText, fontFamily: ibm, fontSize: 13, outline: 'none',
  };

  if (!started) return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#FF3B3B', letterSpacing: '0.15em', marginBottom: 6 }}>// AI_TOOLS</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
          AI<span style={{ color: '#FF3B3B' }}>_TUTOR</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4 }}>Explains clearly, checks understanding, adapts to your level.</p>
      </div>

      {/* ── Saved chat sessions ── */}
      <SavedItemsPanel type="chat" label="CHAT" onLoad={handleLoadSaved} />

      {/* ── Saved quizzes ── */}
      <SavedItemsPanel type="quiz" onLoad={handleLoadSavedQuiz} />

      <div style={{ border: `1px solid ${t.border}`, padding: 28, background: t.bg3, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em' }}>// START_FROM_NOTE</div>
            <button onClick={() => setShowNotes(v => !v)}
              style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', padding: '4px 12px', border: `1px solid ${t.border}`, color: t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = t.accent; (e.currentTarget as HTMLElement).style.color = t.accent }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.border; (e.currentTarget as HTMLElement).style.color = t.fgDim }}>
              SELECT_NOTE {showNotes ? '▲' : '▼'}
            </button>
          </div>
          {showNotes && (
            <div style={{ border: `1px solid ${t.borderSub}`, maxHeight: 180, overflowY: 'auto', background: t.bg2, marginBottom: 8 }}>
              {loadingNotes
                ? <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgMuted, padding: 16, textAlign: 'center' }}>Loading...</div>
                : notes.length === 0
                  ? <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgMuted, padding: 16, textAlign: 'center' }}>No saved notes</div>
                  : notes.map(note => (
                    <button key={note._id} onClick={() => loadFromNote(note)}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${t.borderSub}`, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = t.inpBg)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <div style={{ fontFamily: ibm, fontSize: 12, color: t.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</div>
                      <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, marginTop: 2 }}>{note.subject}</div>
                    </button>
                  ))
              }
            </div>
          )}
          {loadedFrom && <div style={{ fontFamily: ibm, fontSize: 11, color: '#FF3B3B' }}>● Loaded: {loadedFrom}</div>}
        </div>

        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// SUBJECT</div>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Neural Networks, World War II"
            style={inp}
            onFocus={e => e.currentTarget.style.borderColor = '#FF3B3B'}
            onBlur={e => e.currentTarget.style.borderColor = t.inpBorder} />
        </div>

        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 8 }}>// LEVEL</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {LEVELS.map(l => (
              <button key={l} onClick={() => setLevel(l)}
                style={{ flex: 1, fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '8px', textTransform: 'uppercase', background: level === l ? '#FF3B3B' : 'transparent', color: level === l ? '#fff' : t.fgDim, border: `1px solid ${level === l ? '#FF3B3B' : t.border}`, cursor: 'pointer', transition: 'all 0.18s' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <motion.button onClick={() => { if (subject.trim()) setStarted(true) }} disabled={!subject.trim()}
          whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.97 }}
          style={{ background: '#FF3B3B', color: '#fff', border: 'none', padding: '13px', fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', opacity: !subject.trim() ? 0.4 : 1, cursor: 'pointer' }}>
          START_SESSION →
        </motion.button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720, height: 'calc(100vh - 160px)' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: `1px solid ${t.borderSub}`, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => { setStarted(false); setHistory([]); setQuiz(null); setShowSave(false) }}
          style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', transition: 'color 0.18s' }}
          onMouseEnter={e => (e.currentTarget.style.color = t.fg)}
          onMouseLeave={e => (e.currentTarget.style.color = t.fgDim)}>← BACK</button>
        <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#FF3B3B', letterSpacing: '0.06em' }}>{subject.toUpperCase()}</div>
        <div style={{ fontFamily: mono, fontSize: 9, border: '1px solid rgba(255,59,59,0.3)', color: 'rgba(255,59,59,0.7)', padding: '2px 8px', letterSpacing: '0.1em' }}>{level.toUpperCase()}</div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {/* Save chat button */}
          {history.length > 0 && (
            <button onClick={() => { setShowSave(v => !v); if (!saveName) setSaveName(subject || 'Chat') }}
              style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', padding: '5px 12px', border: `1px solid ${savedChat ? '#4ADE80' : t.border}`, color: savedChat ? '#4ADE80' : t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#4ADE80'; (e.currentTarget as HTMLElement).style.color = '#4ADE80' }}
              onMouseLeave={e => { if (!savedChat) { (e.currentTarget as HTMLElement).style.borderColor = t.border; (e.currentTarget as HTMLElement).style.color = t.fgDim } }}>
              {savedChat ? '✓ SAVED' : '↓ SAVE_CHAT'}
            </button>
          )}
          <button onClick={fetchQuiz}
            style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', padding: '5px 12px', border: `1px solid ${t.border}`, color: t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = t.accent; (e.currentTarget as HTMLElement).style.color = t.accent }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.border; (e.currentTarget as HTMLElement).style.color = t.fgDim }}>
            GENERATE_QUIZ
          </button>
        </div>
      </div>

      {/* ── Inline save panel ── */}
      <AnimatePresence>
        {showSave && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', border: `1px solid ${t.dark ? 'rgba(74,222,128,0.25)' : 'rgba(74,222,128,0.35)'}`, background: t.dark ? 'rgba(74,222,128,0.04)' : 'rgba(74,222,128,0.08)' }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: '#4ADE80', letterSpacing: '0.1em', whiteSpace: 'nowrap', alignSelf: 'center' }}>NAME</span>
              <input value={saveName} onChange={e => setSaveName(e.target.value)}
                placeholder="Name this chat session…"
                style={{ flex: 1, background: t.inpBg, border: `1px solid ${t.inpBorder}`, padding: '7px 12px', color: t.inpText, fontFamily: ibm, fontSize: 12, outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = '#4ADE80'}
                onBlur={e  => e.currentTarget.style.borderColor = t.inpBorder}
                onKeyDown={e => e.key === 'Enter' && saveChat()} />
              <button onClick={saveChat} disabled={saving || !saveName.trim()}
                style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '7px 16px', border: '1px solid #4ADE80', background: '#4ADE80', color: '#000', cursor: saving ? 'default' : 'pointer', opacity: !saveName.trim() ? 0.45 : 1 }}>
                {saving ? '…' : '↓ SAVE'}
              </button>
              <button onClick={() => setShowSave(false)}
                style={{ fontFamily: mono, fontSize: 12, color: t.fgMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px' }}>×</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat history ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {history.length === 0 && (
          <div style={{ fontFamily: ibm, fontSize: 13, color: t.fgMuted, padding: '20px 0' }}>
            Ask anything about <span style={{ color: '#FF3B3B' }}>{subject}</span>...
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '12px 16px',
              background: msg.role === 'user' ? 'rgba(255,59,59,0.1)' : t.inpBg,
              border: `1px solid ${msg.role === 'user' ? 'rgba(255,59,59,0.25)' : t.borderSub}`,
              fontFamily: ibm, fontSize: 13, color: t.fg, lineHeight: 1.7,
            }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: msg.role === 'user' ? '#FF3B3B' : t.fgMuted, letterSpacing: '0.1em', marginBottom: 6 }}>
                {msg.role === 'user' ? '// YOU' : '// AI_TUTOR'}
              </div>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '12px 16px', border: `1px solid ${t.borderSub}`, background: t.inpBg }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.1em', marginBottom: 6 }}>// THINKING</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, background: '#FF3B3B', borderRadius: '50%', animation: `pulse ${0.6 + i * 0.2}s infinite` }} />)}
              </div>
            </div>
          </div>
        )}
        {error && <div style={{ fontFamily: ibm, fontSize: 12, color: '#FF3B3B', padding: '8px 12px', border: '1px solid rgba(255,59,59,0.25)' }}>{error}</div>}

        {quiz && (
          <div style={{ border: `1px solid ${t.accentBorder}`, padding: 20, background: t.inpBg, marginTop: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: t.accent, letterSpacing: '0.12em', marginBottom: 16 }}>// QUIZ — {subject.toUpperCase()}</div>
            {quiz.map((q: any, i: number) => (
              <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < quiz.length - 1 ? `1px solid ${t.borderSub}` : 'none' }}>
                <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg, marginBottom: 8, lineHeight: 1.6 }}>{i + 1}. {q.q}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {q.options?.map((opt: string) => {
                    const isCorrect = opt.startsWith(q.answer + ')');
                    const isSelected = quizAnswers[i] === opt;
                    return (
                    <button key={opt} onClick={() => !quizChecked && setQuizAnswers(a => ({ ...a, [i]: opt }))}
                      style={{
                        textAlign: 'left', padding: '8px 12px', fontFamily: ibm, fontSize: 12, cursor: quizChecked ? 'default' : 'pointer',
                        background: quizChecked
                          ? (isCorrect ? 'rgba(74,222,128,0.1)' : isSelected ? 'rgba(255,59,59,0.1)' : 'transparent')
                          : isSelected ? t.inpBg : 'transparent',
                        border: `1px solid ${quizChecked
                          ? (isCorrect ? '#4ADE80' : isSelected ? '#FF3B3B' : t.borderSub)
                          : isSelected ? t.accent : t.borderSub}`,
                        color: quizChecked
                          ? (isCorrect ? '#4ADE80' : isSelected ? '#FF3B3B' : t.fgDim)
                          : isSelected ? t.accent : t.fgDim,
                        transition: 'all 0.15s',
                      }}>
                      {opt}
                    </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!quizChecked
              ? <button onClick={() => setQuizChecked(true)} style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: '10px 20px', background: t.accent, color: '#000', border: 'none', cursor: 'pointer' }}>CHECK_ANSWERS</button>
              : <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: score >= quiz.length * 0.7 ? '#4ADE80' : '#FF3B3B' }}>SCORE: {score}/{quiz.length}</div>
            }
            {/* Save quiz */}
            <SaveBar
              type="quiz"
              data={{ questions: quiz, subject, level }}
              subject={subject}
              defaultName={`${subject} Quiz`}
            />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {history.length < 2 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {SUGGESTED.map(s => (
            <button key={s} onClick={() => sendMessage(s)}
              style={{ fontFamily: ibm, fontSize: 11, padding: '5px 12px', border: `1px solid ${t.border}`, color: t.fgDim, background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF3B3B'; (e.currentTarget as HTMLElement).style.color = '#FF3B3B' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.border; (e.currentTarget as HTMLElement).style.color = t.fgDim }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask anything…"
          style={{ flex: 1, background: t.inpBg, border: `1px solid ${t.inpBorder}`, padding: '11px 14px', color: t.inpText, fontFamily: ibm, fontSize: 13, outline: 'none' }}
          onFocus={e => e.currentTarget.style.borderColor = '#FF3B3B'}
          onBlur={e => e.currentTarget.style.borderColor = t.inpBorder} />
        <motion.button onClick={() => sendMessage()} disabled={!input.trim() || loading} whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
          style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '0 20px', background: '#FF3B3B', color: '#fff', border: 'none', cursor: 'pointer', opacity: (!input.trim() || loading) ? 0.4 : 1 }}>
          SEND
        </motion.button>
      </div>
    </div>
  );
}
