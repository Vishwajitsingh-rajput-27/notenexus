'use client'
export default function DemoModeBanner({ dark }: { dark: boolean }) {
  return (
    <div style={{
      padding: '10px 18px',
      background: 'linear-gradient(135deg, rgba(251,255,72,0.12), rgba(251,255,72,0.06))',
      border: '1px solid rgba(251,255,72,0.35)',
      borderRadius: 12,
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontFamily: "'Space Mono',monospace",
      fontSize: 11,
      gap: 12,
    }}>
      <span style={{ color: '#FBFF48', fontWeight: 700 }}>
        🎮 DEMO MODE — Pre-loaded with sample notes, analytics & progress data
      </span>
      <span style={{ color: 'rgba(251,255,72,0.55)', whiteSpace: 'nowrap' }}>
        Register free to save your own →
      </span>
    </div>
  )
}
