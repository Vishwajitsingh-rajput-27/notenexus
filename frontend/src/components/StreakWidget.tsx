'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

export default function StreakWidget({ dark, collapsed }: { dark: boolean; collapsed?: boolean }) {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    api.get('/gamification/profile').then(r => setData(r.data)).catch(() => {})
  }, [])

  if (!data) return null

  const dim = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'
  const fg  = dark ? '#fff' : '#111'
  const cardBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)'

  if (collapsed) {
    return (
      <div style={{ padding: '8px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 16 }}>🔥</div>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#FF6B35', fontWeight: 700 }}>
          {data.streak}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      margin: '8px 8px 4px',
      padding: 12,
      background: cardBg,
      borderRadius: 12,
      border: `1px solid ${border}`,
    }}>
      {/* Streak + XP */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, color: data.streak > 0 ? '#FF6B35' : dim }}>
            {data.streak}d
          </span>
        </div>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#FBFF48' }}>
          ⚡ Lv{data.level}
        </div>
      </div>

      {/* XP Bar */}
      <div style={{ height: 4, background: border, borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{
          height: '100%',
          width: `${data.xpProgress}%`,
          background: 'linear-gradient(90deg, #FBFF48, #FFD700)',
          borderRadius: 99,
          transition: 'width 0.6s ease',
        }} />
      </div>

      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: dim }}>
        {data.xp} XP · {data.weeklyProgress}/{data.weeklyGoal} this week
      </div>

      {/* Badges */}
      {data.badges?.length > 0 && (
        <div style={{ display: 'flex', gap: 3, marginTop: 7, flexWrap: 'wrap' }}>
          {data.badges.slice(0, 5).map((b: any) => (
            <span key={b.id} title={b.name} style={{ fontSize: 13 }}>{b.icon}</span>
          ))}
        </div>
      )}
    </div>
  )
}
