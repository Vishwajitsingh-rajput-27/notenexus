'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '@/lib/api'

const mono = "'Space Mono','Courier New',monospace"

interface DashData {
  profile: any; stats: any
  heatmap: Record<string, number>
  daily: { date: string; count: number }[]
  subjects: { name: string; count: number }[]
  subjectScores: { subject: string; readinessScore: number }[]
  weakTopics: any[]
}

const BENTO = {
  card: (dark: boolean) => ({
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'}`,
    borderRadius: 16,
    padding: 20,
  }),
}

export default function PerformanceDashboard({ dark }: { dark: boolean }) {
  const [data, setData]             = useState<DashData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [activeSubject, setActive]  = useState<string | null>(null)
  const [readiness, setReadiness]   = useState<any>(null)

  const fg   = dark ? '#fff' : '#111'
  const dim  = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)'
  const green = '#4ADE80'; const red = '#FF3B3B'; const yellow = '#FBFF48'; const blue = '#60A5FA'

  useEffect(() => {
    api.get('/analytics/dashboard').then(r => { setData(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const fetchReadiness = async (subject: string) => {
    setActive(subject)
    try { const r = await api.get(`/analytics/readiness/${encodeURIComponent(subject)}`); setReadiness(r.data) } catch {}
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: dim, fontFamily: mono, fontSize: 12 }}>
      Loading analytics...
    </div>
  )
  if (!data) return (
    <div style={{ textAlign: 'center', padding: 48, color: dim, fontFamily: mono, fontSize: 12 }}>
      No data yet. Start studying to see your analytics!
    </div>
  )

  const { profile, stats, subjects, subjectScores, weakTopics, daily } = data
  const maxDaily = Math.max(...daily.map(d => d.count), 1)

  const statCards = [
    { icon: '🔥', label: 'Streak', value: `${profile.streak}d`, sub: `Best ${profile.longestStreak}d`, color: '#FF6B35' },
    { icon: '⚡', label: 'Total XP',   value: `${profile.xp}`,      sub: `Level ${profile.level}`,     color: yellow },
    { icon: '📅', label: 'Study Days', value: stats.studyDays,       sub: 'Last 30 days',               color: green },
    { icon: '📚', label: 'Notes',      value: stats.notesCount,      sub: 'Uploaded',                   color: blue },
    { icon: '🎯', label: 'Quiz Avg',   value: `${stats.avgQuizScore}%`, sub: 'Accuracy',                color: '#A78BFA' },
    { icon: '⏱',  label: 'Sessions',  value: stats.totalSessions,   sub: 'Last 30 days',               color: '#34D399' },
  ]

  return (
    <div style={{ color: fg, fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>
          Analytics <span style={{ color: yellow }}>Dashboard</span>
        </h2>
        <p style={{ margin: 0, fontSize: 11, color: dim }}>Your study performance overview</p>
      </div>

      {/* Bento Grid — stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            style={{ ...BENTO.card(dark), display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: mono, fontSize: 9, color: dim, letterSpacing: '0.05em' }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 10, color: dim }}>{s.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Main Bento row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, marginBottom: 12 }}>

        {/* 7-day activity bars */}
        <div style={{ ...BENTO.card(dark) }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: dim, marginBottom: 14, letterSpacing: '0.06em' }}>7-DAY ACTIVITY</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 72 }}>
            {(daily.length ? daily.slice(-7) : Array(7).fill({ date: '', count: 0 })).map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', borderRadius: 6, background: d.count > 0 ? yellow : (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'),
                  height: d.count > 0 ? `${Math.max((d.count / maxDaily) * 100, 12)}%` : 8,
                  transition: 'height 0.6s ease',
                }} />
                <div style={{ fontFamily: mono, fontSize: 8, color: dim }}>
                  {d.date ? new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' }) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Readiness by subject */}
        <div style={{ ...BENTO.card(dark) }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: dim, marginBottom: 14, letterSpacing: '0.06em' }}>SUBJECT READINESS</div>
          {subjectScores.length > 0 ? subjectScores.slice(0, 5).map(s => (
            <button key={s.subject} onClick={() => fetchReadiness(s.subject)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', marginBottom: 4 }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: fg, width: 72, textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {s.subject.slice(0, 8).toUpperCase()}
              </div>
              <div style={{ flex: 1, height: 6, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${s.readinessScore}%`, background: s.readinessScore >= 75 ? green : s.readinessScore >= 50 ? yellow : red, transition: 'width 0.7s ease' }} />
              </div>
              <div style={{ fontFamily: mono, fontSize: 9, color: fg, width: 30 }}>{s.readinessScore}%</div>
            </button>
          )) : <div style={{ fontSize: 11, color: dim }}>Take quizzes to see readiness scores.</div>}
        </div>
      </div>

      {/* Readiness detail popup */}
      {activeSubject && readiness && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ ...BENTO.card(dark), marginBottom: 12, display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Gauge */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg width={80} height={80}>
              <circle cx={40} cy={40} r={32} fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} strokeWidth={7} />
              <circle cx={40} cy={40} r={32} fill="none"
                stroke={readiness.readiness >= 75 ? green : readiness.readiness >= 50 ? yellow : red}
                strokeWidth={7}
                strokeDasharray={`${(readiness.readiness / 100) * (2 * Math.PI * 32)} ${2 * Math.PI * 32}`}
                strokeDashoffset={2 * Math.PI * 32 * 0.25}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s ease' }} />
              <text x={40} y={45} textAnchor="middle" fill={fg}
                style={{ fontFamily: mono, fontSize: 15, fontWeight: 700 }}>{readiness.readiness}</text>
            </svg>
            <div style={{ fontFamily: mono, fontSize: 8, color: dim }}>READINESS</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              {activeSubject.toUpperCase()}
            </div>
            {Object.entries(readiness.breakdown).map(([key, val]: any) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: dim, width: 120 }}>
                  {key.replace(/([A-Z])/g, ' $1').toUpperCase()}
                </div>
                <div style={{ flex: 1, height: 5, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${val}%`, background: yellow }} />
                </div>
                <div style={{ fontFamily: mono, fontSize: 9, width: 30 }}>{val}%</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Weak topics */}
        <div style={{ ...BENTO.card(dark) }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: red, marginBottom: 12, letterSpacing: '0.06em' }}>⚠ WEAK TOPICS</div>
          {weakTopics.length > 0 ? weakTopics.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, alignItems: 'center' }}>
              <span>{t.topic}</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: red, background: 'rgba(255,59,59,0.1)', padding: '2px 6px', borderRadius: 6 }}>
                {t.errorCount}×
              </span>
            </div>
          )) : <div style={{ color: dim, fontSize: 11 }}>No weak topics yet — keep taking quizzes!</div>}
        </div>

        {/* Badges */}
        <div style={{ ...BENTO.card(dark) }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: yellow, marginBottom: 12, letterSpacing: '0.06em' }}>🏆 BADGES</div>
          {profile.badges?.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profile.badges.map((b: any) => (
                <div key={b.id} title={b.name}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 10px', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderRadius: 10, border: `1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'}` }}>
                  <span style={{ fontSize: 18 }}>{b.icon}</span>
                  <span style={{ fontFamily: mono, fontSize: 7, color: dim }}>{b.name.toUpperCase().slice(0, 10)}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ color: dim, fontSize: 11 }}>Keep studying to earn badges!</div>}
        </div>
      </div>
    </div>
  )
}
