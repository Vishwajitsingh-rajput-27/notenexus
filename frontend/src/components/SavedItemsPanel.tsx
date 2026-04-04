'use client'
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { apiSaveItem, apiGetSavedItems, apiDeleteSavedItem, SavedItemType } from '@/lib/api'
import { useTheme, mono, ibm, ThemeTokens } from '@/lib/useTheme'

// ── Per-type accent (matches each tool's brand colour) ─────────────────────
export const TYPE_ACCENT: Record<SavedItemType, string> = {
  mindmap:       '#60A5FA',
  flashcards:    '#4ADE80',
  chat:          '#FF3B3B',
  studyplan:     '#A78BFA',
  examquestions: '#F97316',
  quiz:          '#FACC15',
}

// ── Session-type labels ─────────────────────────────────────────────────────
const TYPE_LABEL: Record<SavedItemType, string> = {
  mindmap:       'MIND MAP',
  flashcards:    'FLASHCARD SET',
  chat:          'CHAT SESSION',
  studyplan:     'STUDY PLAN',
  examquestions: 'EXAM QUESTIONS',
  quiz:          'QUIZ',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline previews for each saved item type
// ─────────────────────────────────────────────────────────────────────────────

function MindMapPreview({ data, t }: { data: any; t: ThemeTokens }) {
  if (!data?.root) return null
  const children = data.children?.slice(0, 5) ?? []
  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: t.fg,
                    padding: '4px 12px', background: '#FBFF4818', border: '1px solid #FBFF4840',
                    display: 'inline-block', marginBottom: 8 }}>
        {data.root}
      </div>
      <div style={{ borderLeft: `2px solid ${TYPE_ACCENT.mindmap}30`, paddingLeft: 12 }}>
        {children.map((c: any, i: number) => (
          <div key={i} style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim, padding: '2px 0',
                                display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: TYPE_ACCENT.mindmap, fontSize: 9 }}>▸</span>
            {c.label}
            {c.children?.length > 0 && (
              <span style={{ fontFamily: mono, fontSize: 8, color: t.fgMuted }}>
                +{c.children.length}
              </span>
            )}
          </div>
        ))}
        {(data.children?.length ?? 0) > 5 && (
          <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, paddingTop: 4 }}>
            +{data.children.length - 5} more branches
          </div>
        )}
      </div>
    </div>
  )
}

function FlashcardsPreview({ data, t }: { data: any; t: ThemeTokens }) {
  const cards = data?.cards ?? []
  const mode  = data?.mode ?? 'flashcards'
  if (!cards.length) return null
  const preview = cards.slice(0, 3)
  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: TYPE_ACCENT.flashcards,
                    letterSpacing: '0.1em', marginBottom: 8 }}>
        {cards.length} {mode === 'flashcards' ? 'FLASHCARDS' : 'Q&A PAIRS'}
      </div>
      {preview.map((c: any, i: number) => (
        <div key={i} style={{ marginBottom: 8, padding: '8px 10px',
                              border: `1px solid ${t.borderSub}`, background: t.bg }}>
          <div style={{ fontFamily: ibm, fontSize: 11, color: t.fg, marginBottom: 4 }}>
            {c.question}
          </div>
          <div style={{ fontFamily: ibm, fontSize: 11, color: TYPE_ACCENT.flashcards }}>
            → {c.answer}
          </div>
        </div>
      ))}
      {cards.length > 3 && (
        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>
          +{cards.length - 3} more cards
        </div>
      )}
    </div>
  )
}

function ChatPreview({ data, t }: { data: any; t: ThemeTokens }) {
  const history = data?.history ?? []
  if (!history.length) return null
  const preview = history.slice(0, 4)
  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.1em', marginBottom: 8 }}>
        {history.length} MESSAGES · {data.level?.toUpperCase()} LEVEL
      </div>
      {preview.map((m: any, i: number) => (
        <div key={i} style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: mono, fontSize: 8, color: m.role === 'user' ? TYPE_ACCENT.chat : t.fgMuted,
                         flexShrink: 0, paddingTop: 2 }}>
            {m.role === 'user' ? 'YOU' : 'AI'}
          </span>
          <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim, lineHeight: 1.5,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {m.content}
          </div>
        </div>
      ))}
      {history.length > 4 && (
        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>
          +{history.length - 4} more messages
        </div>
      )}
    </div>
  )
}

function StudyPlanPreview({ data, t }: { data: any; t: ThemeTokens }) {
  const plan = data?.plan ?? data
  if (!plan) return null
  const summary = plan.summary
  const days    = plan.dailyPlan?.slice(0, 3) ?? []
  const sessionTypeColor: Record<string,string> = { study: '#60A5FA', revision: '#A78BFA', practice: '#4ADE80' }
  return (
    <div style={{ padding: '10px 14px' }}>
      {summary && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {[['DAYS', summary.totalDays], ['HOURS', summary.totalHours],
            ['SUBJECTS', summary.subjects?.join(', ')]].map(([l, v]) => (
            <div key={l as string} style={{ fontFamily: mono, fontSize: 9, padding: '3px 10px',
                                           border: `1px solid ${t.border}`, color: t.fgDim,
                                           letterSpacing: '0.08em' }}>
              {l}: {v}
            </div>
          ))}
        </div>
      )}
      {days.map((day: any) => (
        <div key={day.day} style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: TYPE_ACCENT.studyplan,
                         flexShrink: 0, minWidth: 44 }}>
            DAY_{day.day}
          </span>
          <div style={{ flex: 1 }}>
            {day.sessions?.slice(0, 2).map((s: any, si: number) => (
              <div key={si} style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim,
                                     display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                background: sessionTypeColor[s.type] ?? t.fgMuted, display: 'inline-block' }} />
                {s.subject} {s.topic ? `— ${s.topic}` : ''}
              </div>
            ))}
          </div>
        </div>
      ))}
      {(plan.dailyPlan?.length ?? 0) > 3 && (
        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>
          +{plan.dailyPlan.length - 3} more days
        </div>
      )}
    </div>
  )
}

function ExamQuestionsPreview({ data, t }: { data: any; t: ThemeTokens }) {
  const questions = data?.questions ?? []
  if (!questions.length) return null
  const preview = questions.slice(0, 3)
  const diffColor: Record<string,string> = { Easy: '#4ADE80', Medium: '#d97706', Hard: '#FF3B3B' }
  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: TYPE_ACCENT.examquestions,
                    letterSpacing: '0.1em', marginBottom: 8 }}>
        {questions.length} QUESTIONS{data.meta?.subject ? ` · ${data.meta.subject}` : ''}
      </div>
      {preview.map((q: any, i: number) => (
        <div key={i} style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: mono, fontSize: 8, padding: '2px 6px', flexShrink: 0,
                         border: `1px solid ${diffColor[q.difficulty] ?? t.border}`,
                         color: diffColor[q.difficulty] ?? t.fgMuted }}>
            {q.difficulty ?? '–'}
          </span>
          <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim, lineHeight: 1.5,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {q.question}
          </div>
        </div>
      ))}
      {questions.length > 3 && (
        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>
          +{questions.length - 3} more questions
        </div>
      )}
    </div>
  )
}

function QuizPreview({ data, t }: { data: any; t: ThemeTokens }) {
  const questions = data?.questions ?? []
  const subject   = data?.subject ?? ''
  const level     = data?.level ?? ''
  if (!questions.length) return null
  const preview = questions.slice(0, 3)
  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: TYPE_ACCENT.quiz,
                    letterSpacing: '0.1em', marginBottom: 8 }}>
        {questions.length} QUESTIONS{subject ? ` · ${subject.toUpperCase()}` : ''}{level ? ` · ${level.toUpperCase()}` : ''}
      </div>
      {preview.map((q: any, i: number) => (
        <div key={i} style={{ marginBottom: 8, padding: '8px 10px',
                              border: `1px solid ${t.borderSub}`, background: t.bg }}>
          <div style={{ fontFamily: ibm, fontSize: 11, color: t.fg, marginBottom: 4, lineHeight: 1.5 }}>
            {i + 1}. {q.q}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {q.options?.slice(0, 2).map((opt: string) => (
              <span key={opt} style={{ fontFamily: mono, fontSize: 9, color: opt.startsWith(q.answer + ')') ? '#4ADE80' : t.fgMuted,
                                       padding: '1px 6px', border: `1px solid ${opt.startsWith(q.answer + ')') ? '#4ADE8050' : t.borderSub}` }}>
                {opt}
              </span>
            ))}
            {(q.options?.length ?? 0) > 2 && (
              <span style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>…</span>
            )}
          </div>
        </div>
      ))}
      {questions.length > 3 && (
        <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>
          +{questions.length - 3} more questions
        </div>
      )}
    </div>
  )
}

function ItemPreview({ type, data, t }: { type: SavedItemType; data: any; t: ThemeTokens }) {
  switch (type) {
    case 'mindmap':       return <MindMapPreview data={data} t={t} />
    case 'flashcards':    return <FlashcardsPreview data={data} t={t} />
    case 'chat':          return <ChatPreview data={data} t={t} />
    case 'studyplan':     return <StudyPlanPreview data={data} t={t} />
    case 'examquestions': return <ExamQuestionsPreview data={data} t={t} />
    case 'quiz':          return <QuizPreview data={data} t={t} />
    default:              return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SaveBar — shown below a generated result
// ─────────────────────────────────────────────────────────────────────────────
interface SaveBarProps {
  type:         SavedItemType
  data:         any
  subject?:     string
  defaultName?: string
}

export function SaveBar({ type, data, subject, defaultName = '' }: SaveBarProps) {
  const t      = useTheme()
  const accent = TYPE_ACCENT[type]
  const [name, setName]     = useState(defaultName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const save = async () => {
    if (!name.trim()) { toast.error('Give this save a name'); return }
    setSaving(true)
    try {
      await apiSaveItem({ type, name: name.trim(), subject, data })
      toast.success('Saved!')
      setSaved(true)
    } catch { toast.error('Could not save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
      padding: '10px 12px',
      border: `1px solid ${accent}30`,
      background: t.dark ? `${accent}08` : `${accent}0c`,
    }}>
      <span style={{ fontFamily: mono, fontSize: 9, color: accent,
                     letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
        SAVE_RESULT
      </span>
      <input
        value={name}
        onChange={e => { setName(e.target.value); setSaved(false) }}
        placeholder="Name this save…"
        style={{
          flex: 1, background: t.inpBg, border: `1px solid ${t.inpBorder}`,
          padding: '8px 12px', color: t.inpText, fontFamily: ibm, fontSize: 12, outline: 'none',
        }}
        onFocus={e => e.currentTarget.style.borderColor = accent}
        onBlur={e  => e.currentTarget.style.borderColor = t.inpBorder}
        onKeyDown={e => e.key === 'Enter' && save()}
      />
      <button
        onClick={save}
        disabled={saving || saved || !name.trim()}
        style={{
          fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          padding: '8px 16px',
          border: `1px solid ${accent}`,
          background: saved ? `${accent}20` : accent,
          color: saved ? accent : t.dark ? '#000' : '#000',
          cursor: (saving || saved || !name.trim()) ? 'default' : 'pointer',
          opacity: !name.trim() ? 0.4 : 1,
          transition: 'all 0.2s', whiteSpace: 'nowrap',
        }}>
        {saved ? '✓ SAVED' : saving ? 'SAVING…' : '↓ SAVE'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SavedItemsPanel — lives inside each tool, shows its saved items with previews
// ─────────────────────────────────────────────────────────────────────────────
interface SavedItemsPanelProps {
  type:   SavedItemType
  onLoad: (item: any) => void
}

export function SavedItemsPanel({ type, onLoad }: SavedItemsPanelProps) {
  const t      = useTheme()
  const accent = TYPE_ACCENT[type]
  const label  = TYPE_LABEL[type]

  const [open,    setOpen]    = useState(false)
  const [items,   setItems]   = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiGetSavedItems(type)
      setItems(d.items)
    } catch { toast.error('Could not load saved items') }
    finally { setLoading(false) }
  }, [type])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && items.length === 0) fetchItems()
  }

  const del = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    try {
      await apiDeleteSavedItem(id)
      setItems(prev => prev.filter(i => i._id !== id))
      if (expanded === id) setExpanded(null)
      toast.success(`Deleted "${name}"`)
    } catch { toast.error('Could not delete') }
  }

  const handleLoad = (e: React.MouseEvent, item: any) => {
    e.stopPropagation()
    onLoad(item)
    setOpen(false)
    toast.success(`Loaded "${item.name}"`)
  }

  // border colour for the panel container
  const panelBorder = open
    ? `1px solid ${accent}50`
    : `1px solid ${t.border}`

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ── Toggle header ── */}
      <button
        onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: open
            ? (t.dark ? `${accent}0d` : `${accent}10`)
            : t.bg2,
          border: panelBorder,
          cursor: 'pointer', transition: 'all 0.2s',
          borderBottom: open ? 'none' : panelBorder,
        }}>
        {/* accent pip */}
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontFamily: mono, fontSize: 9, color: open ? accent : t.fgDim,
                       letterSpacing: '0.13em', flex: 1, textAlign: 'left',
                       transition: 'color 0.2s' }}>
          SAVED_{label.replace(' ', '_')}S
        </span>
        {items.length > 0 && (
          <span style={{
            fontFamily: mono, fontSize: 8, fontWeight: 700,
            background: accent, color: '#000',
            padding: '1px 7px', borderRadius: 2, letterSpacing: '0.05em',
          }}>
            {items.length}
          </span>
        )}
        <span style={{ fontFamily: mono, fontSize: 10, color: t.fgMuted }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              border: `1px solid ${accent}50`, borderTop: 'none',
              background: t.dark ? t.bg2 : t.bg3,
              maxHeight: 440, overflowY: 'auto',
            }}>
              {/* Loading */}
              {loading && (
                <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgMuted,
                              padding: 20, textAlign: 'center' }}>
                  Loading…
                </div>
              )}

              {/* Empty */}
              {!loading && items.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted,
                                letterSpacing: '0.1em', marginBottom: 6 }}>
                    // NO_SAVED_ITEMS
                  </div>
                  <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgMuted }}>
                    Save a generated result to see it here
                  </div>
                </div>
              )}

              {/* Item rows */}
              {!loading && items.map((item, idx) => {
                const isExpanded = expanded === item._id
                const isLast = idx === items.length - 1
                return (
                  <div key={item._id}
                    style={{
                      borderBottom: isLast ? 'none' : `1px solid ${t.borderSub}`,
                      transition: 'background 0.15s',
                    }}>
                    {/* Row header */}
                    <div
                      onClick={() => setExpanded(isExpanded ? null : item._id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 14px', cursor: 'pointer',
                        background: isExpanded
                          ? (t.dark ? `${accent}0a` : `${accent}0d`)
                          : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => {
                        if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background =
                          t.dark ? `${accent}07` : `${accent}09`
                      }}
                      onMouseLeave={e => {
                        if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                      }}>
                      {/* Expand chevron */}
                      <span style={{ fontFamily: mono, fontSize: 9, color: isExpanded ? accent : t.fgMuted,
                                     transition: 'color 0.15s', flexShrink: 0 }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: ibm, fontSize: 12, color: t.fg,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name}
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 8, color: t.fgMuted,
                                      letterSpacing: '0.08em', marginTop: 2 }}>
                          {item.subject && <span style={{ marginRight: 8, color: accent }}>{item.subject}</span>}
                          {fmtDate(item.createdAt)}
                        </div>
                      </div>
                      {/* Load button */}
                      <button
                        onClick={e => handleLoad(e, item)}
                        style={{
                          fontFamily: mono, fontSize: 9, letterSpacing: '0.07em',
                          padding: '4px 12px',
                          border: `1px solid ${accent}60`,
                          background: t.dark ? `${accent}12` : `${accent}18`,
                          color: accent, cursor: 'pointer', flexShrink: 0,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = `${accent}30`
                          ;(e.currentTarget as HTMLButtonElement).style.borderColor = accent
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = t.dark ? `${accent}12` : `${accent}18`
                          ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${accent}60`
                        }}>
                        LOAD
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={e => del(e, item._id, item.name)}
                        style={{
                          fontFamily: mono, fontSize: 13, color: t.fgMuted,
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '2px 6px', flexShrink: 0, lineHeight: 1,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#FF3B3B')}
                        onMouseLeave={e => (e.currentTarget.style.color = t.fgMuted)}>
                        ×
                      </button>
                    </div>

                    {/* Inline preview */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          style={{ overflow: 'hidden' }}>
                          <div style={{
                            borderTop: `1px solid ${accent}20`,
                            background: t.dark ? t.bg : `${t.bg}cc`,
                          }}>
                            <ItemPreview type={type} data={item.data} t={t} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}

              {/* Refresh footer */}
              {!loading && items.length > 0 && (
                <button
                  onClick={fetchItems}
                  style={{
                    width: '100%', fontFamily: mono, fontSize: 9, color: t.fgMuted,
                    letterSpacing: '0.08em', background: 'none', border: 'none',
                    borderTop: `1px solid ${t.borderSub}`, padding: '8px',
                    cursor: 'pointer', transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = accent)}
                  onMouseLeave={e => (e.currentTarget.style.color = t.fgMuted)}>
                  ↺ REFRESH
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
