// hooks/useTracking.ts — Silent activity tracking
import { useCallback, useRef } from 'react'
import api from '@/lib/api'

type EventType =
  | 'note_view' | 'note_upload' | 'flashcard_flip' | 'flashcard_complete'
  | 'quiz_start' | 'quiz_complete' | 'tutor_message' | 'exam_predict'
  | 'mindmap_view' | 'copilot_run' | 'group_quiz' | 'search'

export const useTracking = () => {
  const sessionStart = useRef<number>(Date.now())

  const track = useCallback(async (
    eventType: EventType,
    data: { subject?: string; topic?: string; quizScore?: number; quizTotal?: number; quizCorrect?: number } = {}
  ) => {
    try {
      const durationMs = Date.now() - sessionStart.current
      await api.post('/analytics/session', { eventType, durationMs, ...data })
      sessionStart.current = Date.now()
    } catch {} // Never throw — tracking is non-critical
  }, [])

  return { track }
}
