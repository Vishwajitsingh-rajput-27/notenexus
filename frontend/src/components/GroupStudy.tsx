'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/lib/store'
import toast from 'react-hot-toast'

const mono = "'Space Mono','Courier New',monospace"
const ibm  = "'IBM Plex Mono','Courier New',monospace"
const BENTO = (dark: boolean): React.CSSProperties => ({
  background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
  border: `1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'}`,
  borderRadius: 16, padding: 20,
})

interface Member { name: string; userId?: string }
interface LeaderboardEntry { name: string; score: number; userId?: string }

export default function GroupStudy({ dark }: { dark: boolean }) {
  const { user }   = useAuthStore()
  const socket     = useSocket()

  const [view, setView]           = useState<'lobby'|'room'|'quiz'|'results'>('lobby')
  const [roomCode, setRoomCode]   = useState('')
  const [joinCode, setJoinCode]   = useState('')
  const [room, setRoom]           = useState<any>(null)
  const [members, setMembers]     = useState<string[]>([])
  const [quizTopic, setQuizTopic] = useState('')
  const [quiz, setQuiz]           = useState<any[]>([])
  const [currentQ, setCurrentQ]   = useState(0)
  const [answered, setAnswered]   = useState<string|null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [timeLeft, setTimeLeft]   = useState(20)
  const [score, setScore]         = useState(0)
  const [playersAns, setPlayersAns] = useState(0)
  const [quizLoading, setQuizLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [joinLoading, setJoinLoading] = useState(false)
  const timerRef = useRef<any>(null)

  const fg     = dark ? '#fff'  : '#111'
  const dim    = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)'
  const green  = '#4ADE80'
  const red    = '#FF3B3B'
  const yellow = '#FBFF48'
  const border = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'

  // My name — fall back to email prefix
  const myName = user?.name || user?.email?.split('@')[0] || 'You'

  // isHost check: compare both _id and id
  const isHost = room && user && (
    room.hostId === user._id || room.hostId === user.id ||
    room.host   === user._id || room.host   === user.id
  )

  // Keep a ref to the latest members list so socket handlers can read it
  // without being added to the useEffect dependency array (which caused
  // event-listener churn and duplicate toasts on every member update).
  const membersRef = useRef<string[]>(members)
  useEffect(() => { membersRef.current = members }, [members])

  // ── Socket event listeners ────────────────────────────────────────────────
  // FIX: removed `members` from dep array — it caused the whole listener block
  //      to unmount/remount on every member-join, producing duplicate toasts,
  //      stale closures, and missed events. membersRef above gives stable access.
  useEffect(() => {
    if (!socket || !roomCode) return

    const onMemberJoined = ({ userName }: any) => {
      setMembers(prev => prev.includes(userName) ? prev : [...prev, userName])
      toast(`${userName} joined! 👋`, { duration: 2000 })
    }
    const onMemberLeft = ({ userName }: any) => {
      setMembers(prev => prev.filter(m => m !== userName))
    }
    const onRoomUsers = ({ users }: any) => {
      if (Array.isArray(users)) setMembers(users)
    }
    const onQuizStarted = ({ questions }: any) => {
      if (!Array.isArray(questions) || !questions.length) return
      // Use membersRef so we always get the current members without needing
      // members in the dep array
      setLeaderboard(membersRef.current.map(m => ({ name: m, score: 0 })))
      setQuiz(questions); setCurrentQ(0); setScore(0)
      setAnswered(null); setPlayersAns(0)
      setView('quiz'); startTimer()
      toast.success('Quiz starting! 🚀')
    }
    const onPlayerAnswered = () => setPlayersAns(p => p + 1)
    const onLeaderboardUpdate = ({ leaderboard: lb }: any) => { if (Array.isArray(lb)) setLeaderboard(lb) }
    const onQuizEnded = ({ finalLeaderboard, winner }: any) => {
      if (Array.isArray(finalLeaderboard)) setLeaderboard(finalLeaderboard)
      setView('results'); clearInterval(timerRef.current)
      toast.success(`🏆 Winner: ${winner || 'Unknown'}!`, { duration: 4000 })
    }

    socket.on('member-joined',      onMemberJoined)
    socket.on('member-left',        onMemberLeft)
    socket.on('room-users',         onRoomUsers)
    socket.on('quiz-started',       onQuizStarted)
    socket.on('player-answered',    onPlayerAnswered)
    socket.on('leaderboard-update', onLeaderboardUpdate)
    socket.on('quiz-ended',         onQuizEnded)

    return () => {
      socket.off('member-joined',      onMemberJoined)
      socket.off('member-left',        onMemberLeft)
      socket.off('room-users',         onRoomUsers)
      socket.off('quiz-started',       onQuizStarted)
      socket.off('player-answered',    onPlayerAnswered)
      socket.off('leaderboard-update', onLeaderboardUpdate)
      socket.off('quiz-ended',         onQuizEnded)
    }
  }, [socket, roomCode]) // ← members intentionally excluded; use membersRef instead

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer = () => {
    setTimeLeft(20); clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); nextQuestion(); return 0 }
        return t - 1
      })
    }, 1000)
  }

  const nextQuestion = () => {
    setAnswered(null); setPlayersAns(0)
    setCurrentQ(q => {
      const next = q + 1
      if (next >= quiz.length) {
        // Quiz over
        const winner = [...leaderboard].sort((a,b) => b.score - a.score)[0]?.name || 'Unknown'
        socket?.emit('quiz-end', { roomCode, finalLeaderboard: leaderboard, winner })
        setView('results')
        return q
      }
      startTimer()
      return next
    })
  }

  // ── Room actions ──────────────────────────────────────────────────────────
  const createRoom = async () => {
    setCreateLoading(true)
    try {
      const r = await api.post('/rooms/create', { subject: 'General', name: `${myName}'s Room` })
      const newRoom = r.data.room
      setRoom(newRoom)
      setRoomCode(newRoom.code)
      setMembers([myName])
      setLeaderboard([{ name: myName, score: 0 }])
      // Emit join-study-room — fixed socket now handles this event
      socket?.emit('join-study-room', { roomCode: newRoom.code, userName: myName })
      setView('room')
      toast.success(`Room created! Code: ${newRoom.code}`)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to create room')
    } finally { setCreateLoading(false) }
  }

  const joinRoom = async () => {
    if (!joinCode.trim()) return toast.error('Enter a room code')
    setJoinLoading(true)
    try {
      const r = await api.post('/rooms/join', { code: joinCode.trim().toUpperCase() })
      const newRoom = r.data.room
      setRoom(newRoom)
      setRoomCode(newRoom.code)
      socket?.emit('join-study-room', { roomCode: newRoom.code, userName: myName })
      setView('room')
      toast.success('Joined room!')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Room not found')
    } finally { setJoinLoading(false) }
  }

  const startQuiz = async () => {
    if (!quizTopic.trim()) return toast.error('Enter a quiz topic')
    setQuizLoading(true)
    try {
      const r = await api.post(`/rooms/${roomCode}/generate-quiz`, { topic: quizTopic, count: 5 })
      // Emit quiz-start — fixed socket now broadcasts 'quiz-started' to all in room
      socket?.emit('quiz-start', { roomCode, questions: r.data.quiz.questions, hostName: myName })
      toast.success('Quiz launched! 🚀')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Quiz generation failed — check GROQ_API_KEY')
    } finally { setQuizLoading(false) }
  }

  const leaveRoom = () => {
    clearInterval(timerRef.current)
    setView('lobby'); setRoom(null); setRoomCode('')
    setMembers([]); setQuiz([]); setScore(0); setLeaderboard([])
  }

  const submitAnswer = (letter: string) => {
    if (answered || view !== 'quiz') return
    setAnswered(letter)
    const q = quiz[currentQ]
    const isCorrect = letter === q.answer
    if (isCorrect) {
      setScore(s => s + 100)
      // Update local leaderboard
      setLeaderboard(lb => lb.map(p => p.name === myName ? { ...p, score: p.score + 100 } : p))
    }
    socket?.emit('quiz-answer', { roomCode, userId: user?._id, userName: myName, questionIndex: currentQ, answer: letter, isCorrect })
    // Host pushes updated leaderboard
    if (isHost) {
      const updated = leaderboard.map(p => p.name === myName && isCorrect ? { ...p, score: p.score + 100 } : p)
      socket?.emit('quiz-leaderboard', { roomCode, leaderboard: updated })
    }
    setTimeout(() => { clearInterval(timerRef.current); nextQuestion() }, 1600)
  }

  // ── INPUT STYLE ───────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', boxSizing: 'border-box',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    border: `1px solid ${border}`, color: fg,
    fontFamily: ibm, fontSize: 12, borderRadius: 10, outline: 'none',
  }
  const btnPrimary: React.CSSProperties = {
    padding: '12px 24px', fontFamily: mono, fontSize: 12, fontWeight: 700,
    background: yellow, color: '#000', border: 'none', borderRadius: 10, cursor: 'pointer',
  }
  const btnSecondary: React.CSSProperties = {
    padding: '12px 24px', fontFamily: mono, fontSize: 12, fontWeight: 700,
    background: 'transparent', color: fg, border: `1px solid ${border}`, borderRadius: 10, cursor: 'pointer',
  }

  // ── LOBBY VIEW ────────────────────────────────────────────────────────────
  if (view === 'lobby') return (
    <div style={{ color: fg, fontFamily: ibm }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: '#60A5FA', letterSpacing: '0.15em', marginBottom: 6 }}>// GROUP_STUDY</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: fg }}>
          GROUP <span style={{ color: yellow }}>STUDY</span> 👥
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: dim }}>Create or join a live study room for quiz battles with friends.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Create Room */}
        <div style={{ ...BENTO(dark), display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.06em', color: green }}>⚡ CREATE ROOM</div>
          <p style={{ margin: 0, fontSize: 11, color: dim, lineHeight: 1.6 }}>
            Start a private study room and share the code with your friends.
          </p>
          <motion.button onClick={createRoom} disabled={createLoading} whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
            style={{ ...btnPrimary, opacity: createLoading ? 0.6 : 1 }}>
            {createLoading ? 'Creating...' : '⚡ Create New Room'}
          </motion.button>
        </div>

        {/* Join Room */}
        <div style={{ ...BENTO(dark), display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.06em', color: '#60A5FA' }}>🔗 JOIN ROOM</div>
          <input
            value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE" maxLength={6}
            style={{ ...inputStyle, fontSize: 18, letterSpacing: '0.25em', textAlign: 'center', fontFamily: mono }}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
          />
          <motion.button onClick={joinRoom} disabled={joinLoading} whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
            style={{ ...btnSecondary, opacity: joinLoading ? 0.6 : 1 }}>
            {joinLoading ? 'Joining...' : '→ Join Room'}
          </motion.button>
        </div>
      </div>
    </div>
  )

  // ── ROOM VIEW ─────────────────────────────────────────────────────────────
  if (view === 'room') return (
    <div style={{ color: fg, fontFamily: ibm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: dim, letterSpacing: '0.12em', marginBottom: 4 }}>// ROOM CODE</div>
          <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: yellow, letterSpacing: '0.2em' }}>
            {roomCode}
          </div>
          <div style={{ fontSize: 11, color: dim, marginTop: 4 }}>Share this code with friends</div>
        </div>
        <button onClick={leaveRoom} style={{ ...btnSecondary, padding: '8px 16px', fontSize: 11 }}>← Leave</button>
      </div>

      {/* Members */}
      <div style={{ ...BENTO(dark), marginBottom: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: dim, marginBottom: 12, letterSpacing: '0.08em' }}>
          MEMBERS ({members.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {members.map(m => (
            <span key={m} style={{
              padding: '5px 14px', fontFamily: mono, fontSize: 10,
              background: m === myName ? `${green}18` : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
              border: `1px solid ${m === myName ? green+'40' : border}`,
              borderRadius: 20, color: m === myName ? green : fg,
            }}>
              {m === myName ? `● ${m} (you)` : m}
            </span>
          ))}
        </div>
        {members.length === 1 && (
          <div style={{ marginTop: 12, fontSize: 11, color: dim }}>
            Waiting for others to join with code <strong style={{ color: yellow }}>{roomCode}</strong>…
          </div>
        )}
      </div>

      {/* Host controls */}
      {isHost ? (
        <div style={{ ...BENTO(dark) }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: yellow, marginBottom: 16, letterSpacing: '0.06em' }}>
            👑 HOST CONTROLS
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: dim, marginBottom: 8, letterSpacing: '0.08em' }}>QUIZ TOPIC</div>
            <input
              value={quizTopic} onChange={e => setQuizTopic(e.target.value)}
              placeholder="e.g. Newton's Laws, Quadratic Equations, Cell Biology…"
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && startQuiz()}
            />
          </div>
          <motion.button onClick={startQuiz} disabled={quizLoading} whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
            style={{ ...btnPrimary, background: green, opacity: quizLoading ? 0.6 : 1 }}>
            {quizLoading ? '⏳ Generating quiz...' : '🚀 Launch Quiz'}
          </motion.button>
          {quizLoading && <div style={{ marginTop: 10, fontSize: 11, color: dim }}>AI is generating questions — this takes ~5 seconds…</div>}
        </div>
      ) : (
        <div style={{ ...BENTO(dark), textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ fontFamily: mono, fontSize: 12, color: dim }}>Waiting for host to start the quiz…</div>
        </div>
      )}
    </div>
  )

  // ── QUIZ VIEW ─────────────────────────────────────────────────────────────
  if (view === 'quiz' && quiz.length > 0) {
    const q = quiz[currentQ]
    const timerColor = timeLeft <= 5 ? red : timeLeft <= 10 ? yellow : green
    return (
      <div style={{ color: fg, fontFamily: ibm }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: dim }}>Q{currentQ+1} / {quiz.length}</div>
          <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 700, color: timerColor }}>{timeLeft}s</div>
          <div style={{ fontFamily: mono, fontSize: 12, color: yellow }}>{score} pts</div>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', marginBottom: 24, overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${(timeLeft / 20) * 100}%` }}
            transition={{ duration: 1, ease: 'linear' }}
            style={{ height: '100%', borderRadius: 99, background: timerColor }}
          />
        </div>

        {/* Question */}
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, lineHeight: 1.6 }}>{q.q}</div>

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {q.options?.map((opt: string, i: number) => {
            const letter = opt[0]
            const isCorrect = !!answered && letter === q.answer
            const isWrong   = answered === letter && letter !== q.answer
            const isSelected = answered === letter
            return (
              <motion.button key={i} onClick={() => submitAnswer(letter)}
                whileHover={!answered ? { scale: 1.02 } : {}}
                style={{
                  padding: 16, textAlign: 'left', fontFamily: ibm, fontSize: 12, lineHeight: 1.5,
                  background: isCorrect ? 'rgba(74,222,128,0.15)' : isWrong ? 'rgba(255,59,59,0.15)' : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                  border: `2px solid ${isCorrect ? green : isWrong ? red : (answered && letter === q.answer ? green : border)}`,
                  color: fg, cursor: answered ? 'default' : 'pointer', borderRadius: 12, transition: 'all 0.2s',
                }}>
                {opt}
                {isCorrect && <span style={{ marginLeft: 8, color: green }}>✓</span>}
                {isWrong   && <span style={{ marginLeft: 8, color: red   }}>✗</span>}
              </motion.button>
            )
          })}
        </div>

        {answered && q.explanation && (
          <div style={{ ...BENTO(dark), fontSize: 12, color: dim, lineHeight: 1.6, marginBottom: 12 }}>
            <strong style={{ color: answered === q.answer ? green : red }}>
              {answered === q.answer ? '✓ Correct!' : `✗ Correct answer: ${q.answer}`}
            </strong>
            {' '}{q.explanation}
          </div>
        )}

        <div style={{ fontFamily: mono, fontSize: 9, color: dim }}>{playersAns} player{playersAns !== 1 ? 's' : ''} answered</div>
      </div>
    )
  }

  // ── RESULTS VIEW ──────────────────────────────────────────────────────────
  if (view === 'results') {
    const sorted = [...leaderboard].sort((a, b) => b.score - a.score)
    const medals = ['🥇','🥈','🥉']
    return (
      <div style={{ color: fg, fontFamily: ibm }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 700, marginBottom: 6 }}>🏆 Quiz Results</div>
          <div style={{ fontSize: 13, color: dim }}>
            Your score: <span style={{ color: yellow, fontSize: 22, fontWeight: 700 }}>{score}</span> pts
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {sorted.map((p, i) => (
            <div key={p.name} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 20px',
              background: i === 0 ? 'rgba(251,255,72,0.08)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
              border: `1px solid ${i === 0 ? 'rgba(251,255,72,0.35)' : border}`,
              borderRadius: 12,
            }}>
              <span style={{ fontFamily: mono, fontSize: 20, width: 32 }}>{medals[i] || `#${i+1}`}</span>
              <span style={{ flex: 1, marginLeft: 12, fontWeight: p.name === myName ? 700 : 400, color: p.name === myName ? yellow : fg }}>
                {p.name}{p.name === myName ? ' (you)' : ''}
              </span>
              <span style={{ fontFamily: mono, color: yellow, fontWeight: 700 }}>{p.score} pts</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <motion.button onClick={() => { setView('room'); setLeaderboard(members.map(m => ({ name: m, score: 0 }))); setScore(0); setQuiz([]) }}
            whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
            style={{ ...btnPrimary, flex: 1 }}>
            🔄 Play Again
          </motion.button>
          <motion.button onClick={leaveRoom} whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }}
            style={{ ...btnSecondary, flex: 1 }}>
            ← Back to Lobby
          </motion.button>
        </div>
      </div>
    )
  }

  return null
}
