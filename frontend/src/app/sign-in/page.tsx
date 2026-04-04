'use client'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { apiLogin, apiActivateDemo } from '@/lib/api'
import Cookies from 'js-cookie'
import { useAuthStore } from '@/lib/store'

const mono = "'Space Mono','Courier New',monospace"
const ibm  = "'IBM Plex Mono','Courier New',monospace"

export default function SignInPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const router = useRouter()

  // FIX: Demo mode handler existed but button was never rendered in JSX
  const handleDemoMode = async () => {
    setDemoLoading(true)
    try {
      const data = await apiActivateDemo()
      Cookies.set('nn_token', data.token, { expires: 7 })
      setAuth(data.user, data.token)
      toast.success('🎮 Demo mode! Explore all features.')
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Demo activation failed')
    } finally { setDemoLoading(false) }
  }

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await apiLogin({ email, password })
      setAuth(data.user, data.token)
      toast.success(`Welcome back, ${data.user.name}!`)
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Login failed')
    } finally { setLoading(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.12)',
    padding: '12px 16px', color: '#fff',
    fontFamily: ibm, fontSize: 13,
    outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  }

  return (
    <>
      <style>{`
        * { cursor: default !important; box-sizing: border-box; }
        input { cursor: text !important; }
        a, button { cursor: pointer !important; }
        ::selection { background: #FBFF48; color: #000; }
        body { margin: 0; background: #0a0a0a; }
      `}</style>

      <div style={{
        minHeight: '100vh', background: '#0a0a0a', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        fontFamily: ibm,
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', maxWidth: 440, position: 'relative' }}
        >
          {/* Corner accents */}
          {[{t:-1,l:-1,bt:1,bl:1},{t:-1,r:-1,bt:1,br:1},{b:-1,l:-1,bb:1,bl:1},{b:-1,r:-1,bb:1,br:1}].map((c,i) => (
            <div key={i} style={{
              position:'absolute', width:20, height:20,
              top:c.t, bottom:c.b, left:c.l, right:c.r,
              borderTop:    c.bt ? '2px solid #FBFF48' : 'none',
              borderBottom: c.bb ? '2px solid #FBFF48' : 'none',
              borderLeft:   c.bl ? '2px solid #FBFF48' : 'none',
              borderRight:  c.br ? '2px solid #FBFF48' : 'none',
            }} />
          ))}

          <div style={{ border: '1px solid rgba(255,255,255,0.10)', padding: '48px 40px', background: '#0f0f0f' }}>

            {/* Header */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: '#4ADE80', letterSpacing: '0.15em', marginBottom: 16 }}>
                ● SYSTEM ACCESS
              </div>
              <h1 style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', marginBottom: 8, margin: '0 0 8px' }}>
                SIGN<span style={{ color: '#FBFF48' }}>_IN</span>
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em', margin: 0 }}>
                Access your NoteNexus account
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', display: 'block', marginBottom: 8 }}>
                  // EMAIL
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="you@example.com" style={inp}
                  onFocus={e => e.currentTarget.style.borderColor = '#FBFF48'}
                  onBlur={e  => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
                />
              </div>

              <div>
                <label style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', display: 'block', marginBottom: 8 }}>
                  // PASSWORD
                </label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••" style={inp}
                  onFocus={e => e.currentTarget.style.borderColor = '#FBFF48'}
                  onBlur={e  => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
                />
              </div>

              <motion.button
                whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={loading || demoLoading}
                style={{
                  width: '100%', background: '#FBFF48', color: '#000',
                  border: 'none', padding: '14px',
                  fontFamily: mono, fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.1em', cursor: 'pointer',
                  opacity: loading ? 0.6 : 1,
                  marginTop: 8,
                }}
              >
                {loading ? 'AUTHENTICATING...' : 'SIGN_IN →'}
              </motion.button>
            </form>

            {/* ── Divider ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 20px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            </div>

            {/* ── DEMO MODE BUTTON — was missing from original JSX ── */}
            <motion.button
              whileHover={{ opacity: 0.85, borderColor: '#FBFF48' }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDemoMode}
              disabled={loading || demoLoading}
              style={{
                width: '100%', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.18)',
                padding: '13px',
                fontFamily: mono, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.1em', color: 'rgba(255,255,255,0.75)',
                cursor: 'pointer', transition: 'all 0.2s',
                opacity: demoLoading ? 0.6 : 1,
              }}
            >
              {demoLoading ? 'LOADING DEMO...' : '🎮  TRY_DEMO_MODE'}
            </motion.button>
            <p style={{ fontFamily: ibm, fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 8, letterSpacing: '0.04em' }}>
              Explore all features with pre-loaded study data — no account needed
            </p>

            {/* Footer */}
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
              <span style={{ fontFamily: ibm, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No account?{' '}</span>
              <Link href="/sign-up" style={{ fontFamily: ibm, fontSize: 12, color: '#FBFF48', textDecoration: 'none', letterSpacing: '0.04em' }}>
                CREATE_ACCOUNT →
              </Link>
            </div>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link href="/" style={{ fontFamily: ibm, fontSize: 11, color: 'rgba(255,255,255,0.25)', textDecoration: 'none', letterSpacing: '0.08em' }}>
                ← BACK TO HOME
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  )
}
