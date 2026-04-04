'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDropzone } from 'react-dropzone'
import api from '@/lib/api'
import toast from 'react-hot-toast'

const mono = "'Space Mono','Courier New',monospace"
const BENTO = (dark: boolean) => ({ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'}`, borderRadius: 16, padding: 20 })

const TYPE_ICONS: Record<string, string> = { pdf: '📄', image: '🖼️', voice: '🎙️', link: '🔗', other: '📎' }
const TYPE_COLOR: Record<string, string> = { pdf: '#FF6B6B', image: '#60A5FA', voice: '#A78BFA', link: '#34D399', other: '#94A3B8' }
const FILTERS = ['all', 'pdf', 'image', 'voice', 'link']

export default function FileVault({ dark }: { dark: boolean }) {
  const [files, setFiles]         = useState<any[]>([])
  const [summary, setSummary]     = useState<any>({})
  const [filter, setFilter]       = useState('all')
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [linkUrl, setLinkUrl]     = useState('')
  const [linkName, setLinkName]   = useState('')
  const [showLink, setShowLink]   = useState(false)
  const [preview, setPreview]     = useState<any>(null)

  const fg    = dark ? '#fff' : '#111'
  const dim   = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)'
  const green = '#4ADE80'; const yellow = '#FBFF48'; const red = '#FF3B3B'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/vault', { params: { type: filter, limit: 30 } })
      setFiles(r.data.files); setSummary(r.data.summary)
    } catch { toast.error('Failed to load files') }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    setUploading(true)
    for (const file of accepted) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('name', file.name)
        await api.post('/vault/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success(`${file.name} saved to vault!`)
      } catch { toast.error(`Failed to upload ${file.name}`) }
    }
    setUploading(false); load()
  }, [load])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg','.jpeg','.png','.webp'], 'audio/*': ['.mp3','.wav','.m4a'], 'video/*': ['.webm'] },
    maxSize: 25 * 1024 * 1024,
  })

  const saveLink = async () => {
    if (!linkUrl.trim()) return toast.error('Enter a URL')
    try {
      await api.post('/vault/link', { url: linkUrl, name: linkName || linkUrl })
      toast.success('Link saved!'); setLinkUrl(''); setLinkName(''); setShowLink(false); load()
    } catch { toast.error('Failed to save link') }
  }

  const deleteFile = async (id: string) => {
    try { await api.delete(`/vault/${id}`); toast.success('Deleted'); load() } catch { toast.error('Delete failed') }
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  return (
    <div style={{ color: fg, fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>
          File <span style={{ color: yellow }}>Vault</span> 🗄️
        </h2>
        <p style={{ margin: 0, fontSize: 11, color: dim }}>Store original files — PDFs, images, voice notes & links exactly as uploaded</p>
      </div>

      {/* Summary Bento Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '10px 6px', textAlign: 'center', background: filter === f ? (dark ? 'rgba(251,255,72,0.1)' : 'rgba(251,255,72,0.15)') : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
            border: `1px solid ${filter === f ? 'rgba(251,255,72,0.4)' : (dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)')}`,
            borderRadius: 12, cursor: 'pointer', color: fg,
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{f === 'all' ? '📂' : TYPE_ICONS[f]}</div>
            <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: filter === f ? yellow : fg }}>{summary[f] || 0}</div>
            <div style={{ fontFamily: mono, fontSize: 8, color: dim, letterSpacing: '0.05em' }}>{f.toUpperCase()}</div>
          </button>
        ))}
      </div>

      {/* Upload zone */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 16 }}>
        <div {...getRootProps()} style={{
          ...BENTO(dark), textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
          borderColor: isDragActive ? yellow : (dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'),
          background: isDragActive ? 'rgba(251,255,72,0.05)' : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
        }}>
          <input {...getInputProps()} />
          <div style={{ fontSize: 28, marginBottom: 8 }}>{uploading ? '⏳' : isDragActive ? '📥' : '☁️'}</div>
          <div style={{ fontFamily: mono, fontSize: 11, color: dim }}>
            {uploading ? 'Uploading...' : isDragActive ? 'Drop to save original' : 'Drop PDF, image or voice · Click to browse'}
          </div>
          <div style={{ fontFamily: mono, fontSize: 9, color: dim, marginTop: 4 }}>Max 25MB · Files stored as-is</div>
        </div>

        <div style={{ ...BENTO(dark), display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: dim, letterSpacing: '0.06em' }}>SAVE A LINK</div>
          {showLink ? (
            <>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." style={{ padding: '7px 10px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`, color: fg, fontFamily: mono, fontSize: 10, borderRadius: 8 }} />
              <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Name (optional)" style={{ padding: '7px 10px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`, color: fg, fontFamily: mono, fontSize: 10, borderRadius: 8 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={saveLink} style={{ flex: 1, padding: '7px', fontFamily: mono, fontSize: 10, background: green, color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Save</button>
                <button onClick={() => setShowLink(false)} style={{ padding: '7px 10px', fontFamily: mono, fontSize: 10, background: 'transparent', color: dim, border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 8, cursor: 'pointer' }}>✕</button>
              </div>
            </>
          ) : (
            <button onClick={() => setShowLink(true)} style={{ flex: 1, padding: 12, fontFamily: mono, fontSize: 11, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: green, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              🔗 Add Link
            </button>
          )}
        </div>
      </div>

      {/* WhatsApp hint */}
      <div style={{ ...BENTO(dark), marginBottom: 16, background: 'rgba(74,222,128,0.04)', borderColor: 'rgba(74,222,128,0.2)', padding: '10px 16px' }}>
        <div style={{ fontFamily: mono, fontSize: 9, color: green, marginBottom: 4, letterSpacing: '0.07em' }}>📱 WHATSAPP BOT — VAULT COMMANDS</div>
        <div style={{ fontSize: 10, color: dim, display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
          <span><b style={{ color: fg }}>files</b> — list all files</span>
          <span><b style={{ color: fg }}>files pdf</b> — list PDFs only</span>
          <span><b style={{ color: fg }}>files image</b> — list images</span>
          <span><b style={{ color: fg }}>files voice</b> — list voice notes</span>
          <span><b style={{ color: fg }}>files link</b> — list links</span>
          <span><b style={{ color: fg }}>file 1</b> — receive file #1 directly</span>
        </div>
      </div>

      {/* File list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: dim, fontFamily: mono, fontSize: 12 }}>Loading vault...</div>
      ) : files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: dim }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗄️</div>
          <div style={{ fontFamily: mono, fontSize: 12 }}>Vault is empty — upload files above</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <AnimatePresence>
            {files.map((f, i) => (
              <motion.div key={f._id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
                style={{ ...BENTO(dark), display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => setPreview(f)}>

                {/* Colour accent by type */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: TYPE_COLOR[f.fileType] || '#94A3B8', borderRadius: '16px 16px 0 0' }} />

                {/* Thumbnail for images */}
                {f.fileType === 'image' && f.fileUrl && (
                  <div style={{ width: '100%', height: 80, borderRadius: 8, overflow: 'hidden', marginTop: 6 }}>
                    <img src={f.thumbnail || f.fileUrl} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                )}

                {/* Icon for non-image */}
                {f.fileType !== 'image' && (
                  <div style={{ fontSize: 32, marginTop: 6 }}>{TYPE_ICONS[f.fileType] || '📎'}</div>
                )}

                <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: TYPE_COLOR[f.fileType] || dim, padding: '2px 6px', background: `${TYPE_COLOR[f.fileType]}18`, borderRadius: 5 }}>
                    {f.fileType.toUpperCase()}
                  </span>
                  {f.size > 0 && <span style={{ fontFamily: mono, fontSize: 9, color: dim }}>{formatSize(f.size)}</span>}
                </div>

                <div style={{ fontFamily: mono, fontSize: 9, color: dim }}>{f.subject}</div>

                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    style={{ flex: 1, padding: '6px', textAlign: 'center', fontFamily: mono, fontSize: 9, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 8, color: fg, textDecoration: 'none' }}>
                    {f.fileType === 'link' ? '🔗 Open' : '⬇ Download'}
                  </a>
                  <button onClick={e => { e.stopPropagation(); deleteFile(f._id) }}
                    style={{ padding: '6px 10px', fontFamily: mono, fontSize: 9, background: 'transparent', border: `1px solid rgba(255,59,59,0.25)`, color: red, borderRadius: 8, cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Preview modal */}
      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={() => setPreview(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
              style={{ background: dark ? '#111' : '#fff', borderRadius: 20, padding: 28, maxWidth: 560, width: '100%', border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: TYPE_COLOR[preview.fileType], marginBottom: 4, letterSpacing: '0.07em' }}>{TYPE_ICONS[preview.fileType]} {preview.fileType.toUpperCase()}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: fg }}>{preview.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: dim, marginTop: 4 }}>{preview.subject} · {formatSize(preview.size)}</div>
                </div>
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: dim, fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>

              {preview.fileType === 'image' && (
                <img src={preview.fileUrl} alt={preview.name} style={{ width: '100%', borderRadius: 12, marginBottom: 16, maxHeight: 300, objectFit: 'contain' }} />
              )}
              {preview.fileType === 'voice' && (
                <audio controls src={preview.fileUrl} style={{ width: '100%', marginBottom: 16 }} />
              )}
              {preview.fileType === 'link' && (
                <div style={{ padding: 14, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderRadius: 10, marginBottom: 16, wordBreak: 'break-all', fontSize: 12, color: dim }}>
                  🔗 {preview.fileUrl}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <a href={preview.fileUrl} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, padding: 12, textAlign: 'center', fontFamily: mono, fontSize: 11, fontWeight: 700, background: yellow, color: '#000', borderRadius: 10, textDecoration: 'none' }}>
                  {preview.fileType === 'link' ? '🔗 Open Link' : '⬇ Download File'}
                </a>
                <button onClick={() => { deleteFile(preview._id); setPreview(null) }}
                  style={{ padding: '12px 16px', fontFamily: mono, fontSize: 11, background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)', color: red, borderRadius: 10, cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
