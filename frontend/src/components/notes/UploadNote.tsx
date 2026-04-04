'use client'
import { useDropzone, type Accept } from 'react-dropzone'
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { apiUploadNote } from '@/lib/api'
import { useTheme, mono, ibm } from '@/lib/useTheme'

const TYPES = [
  { value: 'pdf',     label: 'PDF',         accept: { 'application/pdf': ['.pdf'] } },
  { value: 'image',   label: 'IMAGE',       accept: { 'image/*': ['.jpg','.jpeg','.png','.webp'] } },
  { value: 'voice',   label: 'VOICE',       accept: { 'audio/*': ['.mp3','.wav','.m4a','.webm'] } },
  { value: 'youtube', label: 'YOUTUBE_URL', accept: {} },
]

export default function UploadNote() {
  const t = useTheme()
  const [type, setType]             = useState('pdf')
  const [file, setFile]             = useState<File | null>(null)
  const [ytUrl, setYtUrl]           = useState('')
  const [title, setTitle]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<any>(null)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)
  const [imgPage, setImgPage]       = useState(0)

  const inp: React.CSSProperties = {
    width: '100%', background: t.inpBg, border: `1px solid ${t.inpBorder}`,
    padding: '11px 14px', color: t.inpText,
    fontFamily: ibm, fontSize: 13, outline: 'none', transition: 'border-color 0.2s',
  }

  const curr = TYPES.find(x => x.value === type)!
  const onDrop = useCallback((files: File[]) => { if (files[0]) setFile(files[0]) }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: curr.accept as Accept, multiple: false,
  })

  const handleUpload = async () => {
    if (type !== 'youtube' && !file) { toast.error('Select a file first'); return }
    if (type === 'youtube' && !ytUrl.trim()) { toast.error('Enter a YouTube URL'); return }
    setLoading(true); setResult(null); setImgPage(0)
    try {
      const form = new FormData()
      form.append('sourceType', type)
      if (title)  form.append('title', title)
      if (file)   form.append('file', file)
      if (ytUrl)  form.append('youtubeUrl', ytUrl)
      const data = await apiUploadNote(form)
      setResult(data)
      toast.success(
        data.imageCount > 0
          ? `Note saved! ${data.imageCount} images extracted 🖼️`
          : 'Note saved and organised!'
      )
      setFile(null); setYtUrl(''); setTitle('')
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Upload failed')
    } finally { setLoading(false) }
  }

  const images: string[] = result?.extractedImages || []
  const IMAGES_PER_PAGE = 6

  return (
    <div style={{ maxWidth: 680 }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#FBFF48', letterSpacing: '0.15em', marginBottom: 8 }}>// UPLOAD_MODULE</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg, marginBottom: 6 }}>
          Upload<span style={{ color: '#FBFF48' }}>_Note</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim }}>
          AI will auto-detect subject, chapter and keywords.{' '}
          {type === 'pdf' && <span style={{ color: '#FBFF48' }}>PDF pages &amp; embedded images are extracted automatically.</span>}
        </p>
      </div>

      {/* ── Type selector ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TYPES.map(x => (
          <button key={x.value} onClick={() => { setType(x.value); setFile(null) }}
            style={{
              fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              padding: '7px 14px',
              background: type === x.value ? '#FBFF48' : 'transparent',
              color: type === x.value ? '#000' : t.fgDim,
              border: `1px solid ${type === x.value ? '#FBFF48' : t.inpBorder}`,
              transition: 'all 0.18s', cursor: 'pointer',
            }}>
            {x.label}
          </button>
        ))}
      </div>

      {/* ── Title ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// TITLE_OPTIONAL</div>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="AI will generate one if left blank"
          style={inp}
          onFocus={e => e.currentTarget.style.borderColor = '#FBFF48'}
          onBlur={e  => e.currentTarget.style.borderColor = t.inpBorder}
        />
      </div>

      {/* ── File drop or YouTube ── */}
      {type === 'youtube' ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6 }}>// YOUTUBE_URL</div>
          <input value={ytUrl} onChange={e => setYtUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            style={inp}
            onFocus={e => e.currentTarget.style.borderColor = '#FBFF48'}
            onBlur={e  => e.currentTarget.style.borderColor = t.inpBorder}
          />
        </div>
      ) : (
        <div {...getRootProps()} style={{
          border: `1px dashed ${isDragActive ? '#FBFF48' : t.border}`,
          padding: '48px 24px', marginBottom: 16, textAlign: 'center',
          background: isDragActive ? 'rgba(251,255,72,0.04)' : t.inpBg,
          transition: 'all 0.2s', cursor: 'pointer',
        }}>
          <input {...getInputProps()} />
          {file ? (
            <div>
              <div style={{ fontFamily: mono, fontSize: 11, color: '#4ADE80', letterSpacing: '0.1em', marginBottom: 4 }}>● FILE_SELECTED</div>
              <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg }}>{file.name}</div>
              <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim, marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB</div>
            </div>
          ) : (
            <div>
              <div style={{ fontFamily: mono, fontSize: 28, marginBottom: 12, color: t.fgMuted }}>+</div>
              <div style={{ fontFamily: ibm, fontSize: 13, color: t.fgDim, marginBottom: 4 }}>
                Drag & drop or <span style={{ color: '#FBFF48' }}>click to browse</span>
              </div>
              <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgMuted }}>
                {type === 'pdf' ? '.PDF — text + images extracted automatically'
                  : type === 'image' ? '.JPG .PNG .WEBP'
                  : '.MP3 .WAV .M4A'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Upload button ── */}
      <motion.button onClick={handleUpload} disabled={loading}
        whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.97 }}
        style={{ width: '100%', background: '#FBFF48', color: '#000', border: 'none', padding: '13px', fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', opacity: loading ? 0.6 : 1, cursor: 'pointer' }}>
        {loading
          ? type === 'pdf' ? 'EXTRACTING TEXT + IMAGES...' : 'AI PROCESSING...'
          : 'UPLOAD & AUTO-ORGANISE →'}
      </motion.button>

      {/* ── Result card ── */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginTop: 24, border: '1px solid rgba(74,222,128,0.25)', padding: 20, background: 'rgba(74,222,128,0.04)' }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: '#4ADE80', letterSpacing: '0.15em', marginBottom: 16 }}>● NOTE_SAVED</div>

            {/* Meta grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[['SUBJECT', result.subject, '#FBFF48'], ['CHAPTER', result.chapter, '#60A5FA']].map(([l, v, c]) => (
                <div key={l as string} style={{ border: `1px solid ${c}30`, padding: '10px 14px', background: `${c}08` }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: c as string, letterSpacing: '0.12em', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontFamily: ibm, fontSize: 13, color: t.fg }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim }}>{result.wordCount} words</span>
              {result.imageCount > 0 && (
                <span style={{ fontFamily: mono, fontSize: 11, color: '#FBFF48', fontWeight: 700 }}>
                  🖼️ {result.imageCount} {result.imageCount === 1 ? 'image' : 'images'} extracted
                </span>
              )}
            </div>

            {/* Keywords */}
            {result.keywords?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {result.keywords.map((k: string) => (
                  <span key={k} style={{ fontFamily: ibm, fontSize: 11, padding: '3px 10px', border: `1px solid ${t.border}`, color: t.fgDim }}>{k}</span>
                ))}
              </div>
            )}

            {/* Preview */}
            <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, fontStyle: 'italic', marginBottom: images.length ? 20 : 0 }}>
              {result.preview}…
            </div>

            {/* ── IMAGE GALLERY ── */}
            {images.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#FBFF48', letterSpacing: '0.12em' }}>
                    // EXTRACTED_IMAGES ({images.length})
                  </div>
                  {images.length > IMAGES_PER_PAGE && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setImgPage(p => Math.max(0, p - 1))} disabled={imgPage === 0}
                        style={{ fontFamily: mono, fontSize: 9, padding: '4px 10px', background: 'transparent', border: `1px solid ${t.border}`, color: imgPage === 0 ? t.fgMuted : t.fg, cursor: imgPage === 0 ? 'not-allowed' : 'pointer' }}>
                        ← PREV
                      </button>
                      <span style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, lineHeight: '26px' }}>
                        {imgPage + 1}/{Math.ceil(images.length / IMAGES_PER_PAGE)}
                      </span>
                      <button onClick={() => setImgPage(p => Math.min(Math.ceil(images.length / IMAGES_PER_PAGE) - 1, p + 1))}
                        disabled={imgPage >= Math.ceil(images.length / IMAGES_PER_PAGE) - 1}
                        style={{ fontFamily: mono, fontSize: 9, padding: '4px 10px', background: 'transparent', border: `1px solid ${t.border}`, color: t.fg, cursor: 'pointer' }}>
                        NEXT →
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {images.slice(imgPage * IMAGES_PER_PAGE, (imgPage + 1) * IMAGES_PER_PAGE).map((url, i) => (
                    <motion.div key={url} whileHover={{ scale: 1.03 }}
                      onClick={() => setLightboxImg(url)}
                      style={{ cursor: 'pointer', border: `1px solid ${t.border}`, overflow: 'hidden', position: 'relative', aspectRatio: '3/4', background: t.inpBg }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Extracted image ${imgPage * IMAGES_PER_PAGE + i + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                      />
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '4px 6px' }}>
                        <span style={{ fontFamily: mono, fontSize: 8, color: '#aaa' }}>
                          {imgPage * IMAGES_PER_PAGE + i + 1}/{images.length}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div style={{ fontFamily: ibm, fontSize: 10, color: t.fgMuted, marginTop: 8 }}>
                  Click any image to enlarge. These are synced to your WhatsApp bot.
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxImg && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightboxImg(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
              style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightboxImg} alt="Extracted page" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', border: '1px solid rgba(255,255,255,0.1)' }} />
              <button onClick={() => setLightboxImg(null)}
                style={{ position: 'absolute', top: -14, right: -14, background: '#FBFF48', color: '#000', border: 'none', width: 28, height: 28, fontFamily: mono, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                ✕
              </button>
              <a href={lightboxImg} download target="_blank" rel="noreferrer"
                style={{ display: 'block', marginTop: 10, fontFamily: mono, fontSize: 9, color: '#FBFF48', textAlign: 'center', textDecoration: 'none', letterSpacing: '0.1em' }}>
                ↓ DOWNLOAD IMAGE
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
