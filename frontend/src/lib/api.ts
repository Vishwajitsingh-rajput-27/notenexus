/**
 * lib/api.ts — NoteNexus API client
 * FIXES:
 *  - apiGetAnalytics → /analytics/dashboard  (was /analytics — 404)
 *  - apiGetGamification → /gamification/profile  (was /gamification — 404)
 *  - apiGenerateFlashcards → POST /revision/flashcards with { content } body
 *  - apiGenerateMindMap → POST /revision/mindmap with { content } body
 *  - apiGetRooms → GET /rooms  (route now exists in backend)
 *  - apiCreateRoom → POST /rooms  (route now exists in backend)
 */

import axios from 'axios'
import Cookies from 'js-cookie'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use((config) => {
  const token = Cookies.get('nn_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Intercept responses to surface backend error messages cleanly
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Preserve the original error so callers can read error.response.data.message
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────

export const apiLogin = async (body: { email: string; password: string }) => {
  const { data } = await api.post('/auth/login', body)
  return data
}

export const apiRegister = async (body: { name: string; email: string; password: string }) => {
  const { data } = await api.post('/auth/register', body)
  return data
}

export const apiMe = async () => {
  const { data } = await api.get('/auth/me')
  return data
}

export const apiUpdateProfile = async (body: { name?: string; email?: string }) => {
  const { data } = await api.patch('/auth/profile', body)
  return data
}

export const apiChangePassword = async (body: { currentPassword: string; newPassword: string }) => {
  const { data } = await api.patch('/auth/password', body)
  return data
}

export const apiGetStats = async () => {
  const { data } = await api.get('/auth/stats')
  return data
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export const apiUploadNote = async (formData: FormData) => {
  const { data } = await api.post('/notes/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const apiGetNotes = async (params?: { subject?: string; page?: number } | string) => {
  const query = typeof params === 'string' ? { subject: params } : params
  const { data } = await api.get('/notes', { params: query })
  return data
}

export const apiGetNote = async (id: string) => {
  const { data } = await api.get(`/notes/${id}`)
  return data
}

export const apiDeleteNote = async (id: string) => {
  const { data } = await api.delete(`/notes/${id}`)
  return data
}

export const apiShareNote = async (id: string, share: boolean | string) => {
  const { data } = await api.patch(`/notes/${id}/share`, { shared: share })
  return data
}

export const apiGetSubjects = async () => {
  const { data } = await api.get('/notes/subjects')
  return data
}

export const apiSearch = async (query: string) => {
  const { data } = await api.post('/search', { query })
  return data
}

export const apiGetSharedNotes = async () => {
  const { data } = await api.get('/notes/shared')
  return data
}

export const apiUpvoteNote = async (id: string) => {
  const { data } = await api.post(`/notes/${id}/upvote`)
  return data
}

// ── Revision ──────────────────────────────────────────────────────────────────

export const apiGenerateFlashcards = async (body: { content: string; subject?: string }) => {
  // FIX: Backend route is POST /revision/flashcards, accepts { content }
  const { data } = await api.post('/revision/flashcards', { content: body.content })
  return data
}

export const apiGenerateMindMap = async (body: { content: string; subject?: string }) => {
  // FIX: Backend route is POST /revision/mindmap, accepts { content }
  const { data } = await api.post('/revision/mindmap', { content: body.content })
  return data
}

export const apiGenerateSummary = async (body: { content: string }) => {
  const { data } = await api.post('/revision/summary', { content: body.content })
  return data
}

export const apiGenerateQuestions = async (body: { content: string }) => {
  const { data } = await api.post('/revision/questions', { content: body.content })
  return data
}

// ── Tutor ─────────────────────────────────────────────────────────────────────

export const apiAskTutor = async (body: { question: string; subject?: string; level?: string; history?: any[] }) => {
  const { data } = await api.post('/tutor/ask', body)
  return data
}

export const apiTutorChat = async (body: { message: string; subject?: string; level?: string; history?: any[] }) => {
  const { data } = await api.post('/tutor/chat', body)
  return data
}

// ── Exam Predictor ────────────────────────────────────────────────────────────

export const apiPredictExam = async (body: { content: string; subject?: string }) => {
  const { data } = await api.post('/exam/predict', { noteContent: body.content, subject: body.subject })
  return data
}

// ── Study Planner ─────────────────────────────────────────────────────────────

export const apiGeneratePlan = async (body: { subject?: string; examDate?: string; hoursPerDay?: number }) => {
  const { data } = await api.post('/planner/generate', body)
  return data
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export const apiGetReminders = async () => {
  const { data } = await api.get('/reminders')
  return data
}

export const apiCreateReminder = async (body: any) => {
  const { data } = await api.post('/reminders', body)
  return data
}

export const apiDeleteReminder = async (id: string) => {
  const { data } = await api.delete(`/reminders/${id}`)
  return data
}

// ── Analytics ─────────────────────────────────────────────────────────────────

// FIX: Backend route is /analytics/dashboard, not /analytics
export const apiGetAnalytics = async () => {
  const { data } = await api.get('/analytics/dashboard')
  return data
}

// ── Copilot ───────────────────────────────────────────────────────────────────

export const apiCopilotChat = async (body: { message: string; history?: any[] }) => {
  const { data } = await api.post('/copilot/chat', body)
  return data
}

export const apiCopilotAnalyze = async (body: { subject: string }) => {
  const { data } = await api.post('/copilot/analyze', body)
  return data
}

export const apiCopilotPrepKit = async (body: { subject: string; weakTopics?: string[]; examDate?: string }) => {
  const { data } = await api.post('/copilot/prep-kit', body)
  return data
}

// ── Gamification ──────────────────────────────────────────────────────────────

// FIX: Backend route is /gamification/profile, not /gamification
export const apiGetGamification = async () => {
  const { data } = await api.get('/gamification/profile')
  return data
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export const apiGetRooms = async () => {
  const { data } = await api.get('/rooms')
  return data
}

export const apiCreateRoom = async (body: { name: string; subject?: string }) => {
  // FIX: Backend now has POST /rooms (alias for /rooms/create)
  const { data } = await api.post('/rooms', body)
  return data
}

export const apiJoinRoom = async (code: string) => {
  const { data } = await api.post('/rooms/join', { code })
  return data
}

// ── Saved Items ───────────────────────────────────────────────────────────────

export const apiGetSaved = async () => {
  const { data } = await api.get('/saved')
  return data
}

export const apiSaveItem = async (body: any) => {
  const { data } = await api.post('/saved', body)
  return data
}

export const apiDeleteSaved = async (id: string) => {
  const { data } = await api.delete(`/saved/${id}`)
  return data
}

// ── File Vault ────────────────────────────────────────────────────────────────

export const apiGetVault = async () => {
  const { data } = await api.get('/vault')
  return data
}

export const apiDeleteVaultFile = async (id: string) => {
  const { data } = await api.delete(`/vault/${id}`)
  return data
}

// ── Demo ──────────────────────────────────────────────────────────────────────

export const apiActivateDemo = async () => {
  const { data } = await api.post('/demo/activate')
  return data
}

// ── Default export (axios instance for custom calls) ─────────────────────────
export default api

// ── apiRevision — used by Flashcards.tsx and MindMap.tsx ─────────────────────
// These components call apiRevision(text, type) — a convenience wrapper
// FIX: was missing from api.ts, causing "Generation failed" on every generate
export const apiRevision = async (text: string, type: string) => {
  const { data } = await api.post(`/revision/${type}`, { content: text, text })
  return data
}
