'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'
import toast from 'react-hot-toast'

const mono = "'Space Mono','Courier New',monospace"

const BENTO_CARD = (dark: boolean) => ({
  background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
  border: `1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'}`,
  borderRadius: 16,
  padding: 20,
})

export default function StudyCopilot({ dark }: { dark: boolean }) {
  const [subjects, setSubjects]         = useState<string[]>([])
  const [selected, setSelected]         = useState('')
  const [examDate, setExamDate]         = useState('')
  const [analysis, setAnalysis]         = useState<any>(null)
  const [prepKit, setPrepKit]           = useState<any>(null)
  const [loading, setLoading]           = useState(false)
  const [step, setStep]                 = useState<'select'|'analysis'|'prepkit'>('select')
  const [dailyQ, setDailyQ]             = useState<any>(null)
  const [showAnswer, setShowAnswer]     = useState(false)

  const fg    = dark ? '#fff' : '#111'
  const dim   = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)'
  const green = '#4ADE80'; const red = '#FF3B3B'; const yellow = '#FBFF48'; const blue = '#60A5FA'

  useEffect(() => {
    api.get('/notes/subjects').then(r => setSubjects(r.data.subjects || [])).catch(() => {})
    api.get('/copilot/daily-question').then(r => setDailyQ(r.data)).catch(() => {})
  }, [])

  const runAnalysis = async () => {
    if (!selected) return toast.error('Select a subject first')
    setLoading(true); setStep('analysis')
    try {
      const r = await api.post('/copilot/analyze', { subject: selected })
      setAnalysis(r.data.analysis)
      toast.success('Analysis complete!')
    } catch (e: any) {
      toast.error(e.response?.data?.error === 'PLAN_UPGRADE_REQUIRED'
        ? 'Upgrade to Pro to use Study Copilot!'
        : (e.response?.data?.error || 'Analysis failed'))
      setStep('select')
    }
    setLoading(false)
  }

  const generateKit = async () => {
    setLoading(true)
    try {
      const r = await api.post('/copilot/prep-kit', {
        subject: selected,
        weakTopics: analysis?.weakTopics?.map((t: any) => t.topic) || [],
        examDate: examDate || undefined,
      })
      setPrepKit(r.data.prepKit); setStep('prepkit')
      toast.success('Prep kit ready!')
    } catch { toast.error('Failed to generate prep kit') }
    setLoading(false)
  }

  const urgColor = (u: string) => u === 'high' ? red : u === 'medium' ? yellow : green

  const Chip = ({ label, color = yellow }: { label: string; color?: string }) => (
    <span style={{ padding: '3px 10px', fontSize: 10, fontFamily: mono, border: `1px solid ${color}`, color, borderRadius: 6 }}>{label}</span>
  )

  return (
    <div style={{ color: fg, fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>
          Study <span style={{ color: yellow }}>Copilot</span> ⭐
        </h2>
        <p style={{ margin: 0, fontSize: 11, color: dim }}>AI-powered exam prep — finds gaps in your notes & builds your study kit</p>
      </div>

      {/* Daily Question Bento Card */}
      {dailyQ?.question && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ ...BENTO_CARD(dark), marginBottom: 16, borderColor: 'rgba(251,255,72,0.25)', background: 'rgba(251,255,72,0.05)' }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: yellow, marginBottom: 10, letterSpacing: '0.07em' }}>
            📅 TODAY'S PERSONALIZED QUESTION — {dailyQ.subject?.toUpperCase()}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>
            {dailyQ.question?.question}
          </div>
          {dailyQ.question?.options?.map((opt: string, i: number) => (
            <div key={i} style={{ fontSize: 11, color: dim, marginBottom: 3 }}>{opt}</div>
          ))}
          {!showAnswer ? (
            <button onClick={() => setShowAnswer(true)} style={{ marginTop: 10, padding: '6px 14px', fontFamily: mono, fontSize: 9, background: 'rgba(251,255,72,0.15)', border: '1px solid rgba(251,255,72,0.3)', color: yellow, borderRadius: 8, cursor: 'pointer' }}>
              REVEAL ANSWER
            </button>
          ) : (
            <div style={{ marginTop: 10, padding: 12, background: 'rgba(74,222,128,0.1)', borderRadius: 10, border: '1px solid rgba(74,222,128,0.2)' }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: green, marginBottom: 4 }}>ANSWER: {dailyQ.question?.answer}</div>
              <div style={{ fontSize: 11, color: dim }}>{dailyQ.question?.explanation}</div>
            </div>
          )}
        </motion.div>
      )}

      {/* Step: Select */}
      {step === 'select' && (
        <div style={{ ...BENTO_CARD(dark) }}>
          <div style={{ fontFamily: mono, fontSize: 11, marginBottom: 16, letterSpacing: '0.06em' }}>SELECT SUBJECT TO ANALYZE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {subjects.map(s => (
              <button key={s} onClick={() => setSelected(s)} style={{
                padding: '8px 16px', fontFamily: mono, fontSize: 11,
                background: selected === s ? yellow : 'transparent',
                color: selected === s ? '#000' : fg,
                border: `1px solid ${selected === s ? yellow : (dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)')}`,
                borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
              }}>{s}</button>
            ))}
            {subjects.length === 0 && <div style={{ color: dim, fontSize: 11 }}>Upload notes to subjects first</div>}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 9, color: dim, marginBottom: 6 }}>EXAM DATE (OPTIONAL)</div>
              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} style={{
                padding: '8px 12px', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`, color: fg,
                fontFamily: mono, fontSize: 11, borderRadius: 10,
              }} />
            </div>
          </div>

          <button onClick={runAnalysis} disabled={!selected} style={{
            padding: '12px 28px', fontFamily: mono, fontSize: 12, fontWeight: 700,
            background: selected ? yellow : 'transparent', color: selected ? '#000' : dim,
            border: `1px solid ${selected ? yellow : (dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)')}`,
            borderRadius: 10, cursor: selected ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
          }}>
            🤖 Analyze My Notes
          </button>
          <div style={{ marginTop: 10, fontSize: 10, color: dim }}>⭐ Pro feature — analyzes all notes, finds gaps, predicts exam topics</div>
        </div>
      )}

      {/* Step: Analysis loading / results */}
      {step === 'analysis' && (
        <AnimatePresence>
          {loading ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ ...BENTO_CARD(dark), textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: dim }}>Analyzing {selected.toUpperCase()} notes...</div>
              <div style={{ fontSize: 10, color: dim, marginTop: 6 }}>Reading all notes, finding gaps, predicting exam topics</div>
            </motion.div>
          ) : analysis ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Coverage score */}
              <div style={{ ...BENTO_CARD(dark), display: 'flex', alignItems: 'center', gap: 20, marginBottom: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 48, fontWeight: 700, color: (analysis.overallCoverage || 0) > 70 ? green : yellow, lineHeight: 1 }}>
                  {analysis.overallCoverage || 0}<span style={{ fontSize: 20 }}>%</span>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>Overall Coverage</div>
                  <div style={{ fontSize: 11, color: dim, marginTop: 4, maxWidth: 320 }}>{analysis.recommendation}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {/* Priorities */}
                {analysis.priorities?.length > 0 && (
                  <div style={{ ...BENTO_CARD(dark) }}>
                    <div style={{ fontFamily: mono, fontSize: 10, color: yellow, marginBottom: 12, letterSpacing: '0.06em' }}>🎯 STUDY PRIORITIES</div>
                    {analysis.priorities.slice(0, 4).map((p: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                        <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: urgColor(p.urgency) }}>#{p.rank}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{p.topic}</div>
                          <div style={{ fontSize: 10, color: dim }}>{p.reason}</div>
                          <Chip label={p.urgency?.toUpperCase()} color={urgColor(p.urgency)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Missing topics */}
                <div style={{ ...BENTO_CARD(dark) }}>
                  {analysis.missingTopics?.length > 0 && (
                    <>
                      <div style={{ fontFamily: mono, fontSize: 10, color: red, marginBottom: 10, letterSpacing: '0.06em' }}>⚠ MISSING TOPICS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {analysis.missingTopics.map((t: string) => <Chip key={t} label={t} color={red} />)}
                      </div>
                    </>
                  )}
                  {analysis.coveredTopics?.length > 0 && (
                    <>
                      <div style={{ fontFamily: mono, fontSize: 10, color: green, marginBottom: 8, letterSpacing: '0.06em' }}>✅ COVERED</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {analysis.coveredTopics.slice(0, 8).map((t: string) => <Chip key={t} label={t} color={green} />)}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={generateKit} style={{ flex: 1, padding: 14, fontFamily: mono, fontSize: 12, fontWeight: 700, background: yellow, color: '#000', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
                  📦 Generate Full Prep Kit
                </button>
                <button onClick={() => setStep('select')} style={{ padding: '14px 20px', fontFamily: mono, fontSize: 11, background: 'transparent', color: dim, border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`, borderRadius: 12, cursor: 'pointer' }}>
                  ← Back
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}

      {/* Step: Prep Kit */}
      {step === 'prepkit' && prepKit && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {prepKit.studySchedule?.length > 0 && (
            <div style={{ ...BENTO_CARD(dark), marginBottom: 12 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: yellow, marginBottom: 14, letterSpacing: '0.06em' }}>📅 STUDY SCHEDULE</div>
              {prepKit.studySchedule.map((d: any) => (
                <div key={d.day} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: yellow, minWidth: 36 }}>D{d.day}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{d.topic} <span style={{ color: dim, fontSize: 10 }}>({d.duration})</span></div>
                    {d.tasks?.map((t: string, i: number) => <div key={i} style={{ fontSize: 10, color: dim }}>• {t}</div>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {prepKit.highPriorityQuestions?.length > 0 && (
            <div style={{ ...BENTO_CARD(dark), marginBottom: 12 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: red, marginBottom: 14, letterSpacing: '0.06em' }}>🔥 HIGH-PRIORITY QUESTIONS</div>
              {prepKit.highPriorityQuestions.slice(0, 5).map((q: any, i: number) => (
                <div key={i} style={{ marginBottom: 16, padding: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderRadius: 10, border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}` }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: dim, marginBottom: 6 }}>Q{i+1} · {q.type} · {q.difficulty}</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{q.question}</div>
                  {q.options?.map((o: string) => <div key={o} style={{ fontSize: 10, color: dim }}>{o}</div>)}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontFamily: mono, fontSize: 9, color: green, cursor: 'pointer' }}>Show Answer</summary>
                    <div style={{ marginTop: 6, fontSize: 11, color: green, padding: 8, background: 'rgba(74,222,128,0.08)', borderRadius: 8 }}>{q.answer}</div>
                  </details>
                </div>
              ))}
            </div>
          )}

          {prepKit.formulaSheet?.length > 0 && (
            <div style={{ ...BENTO_CARD(dark), marginBottom: 12 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: blue, marginBottom: 12, letterSpacing: '0.06em' }}>📐 FORMULA SHEET</div>
              {prepKit.formulaSheet.map((f: string, i: number) => (
                <div key={i} style={{ fontSize: 11, padding: '6px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>{f}</div>
              ))}
            </div>
          )}

          {prepKit.lastMinuteTips?.length > 0 && (
            <div style={{ ...BENTO_CARD(dark), marginBottom: 12, borderColor: 'rgba(74,222,128,0.25)', background: 'rgba(74,222,128,0.05)' }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: green, marginBottom: 12, letterSpacing: '0.06em' }}>⚡ LAST MINUTE TIPS</div>
              {prepKit.lastMinuteTips.map((t: string, i: number) => (
                <div key={i} style={{ fontSize: 11, color: dim, marginBottom: 6, display: 'flex', gap: 8 }}>
                  <span style={{ color: green }}>→</span> {t}
                </div>
              ))}
            </div>
          )}

          <button onClick={() => { setStep('select'); setAnalysis(null); setPrepKit(null) }}
            style={{ padding: '10px 24px', fontFamily: mono, fontSize: 11, background: 'transparent', color: dim, border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`, borderRadius: 10, cursor: 'pointer' }}>
            ← Analyze Another Subject
          </button>
        </motion.div>
      )}
    </div>
  )
}
