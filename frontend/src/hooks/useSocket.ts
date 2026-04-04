import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/lib/store'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000'

let globalSocket: Socket | null = null

export function useSocket(): Socket | null {
  const socketRef = useRef<Socket | null>(null)
  const { token } = useAuthStore()

  useEffect(() => {
    // No token — disconnect any existing socket and bail
    if (!token) {
      if (globalSocket) {
        globalSocket.disconnect()
        globalSocket = null
      }
      socketRef.current = null
      return
    }

    // Reuse existing connected socket
    if (!globalSocket || !globalSocket.connected) {
      globalSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      })

      globalSocket.on('connect', () => {
        console.log('[socket] connected:', globalSocket?.id)
      })

      globalSocket.on('disconnect', (reason) => {
        console.log('[socket] disconnected:', reason)
      })

      globalSocket.on('connect_error', (err) => {
        console.warn('[socket] connect error:', err.message)
      })
    }

    socketRef.current = globalSocket

    // Cleanup on unmount — keep socket alive for the session
    return () => {
      socketRef.current = null
    }
  }, [token])

  return socketRef.current
}

// Call this explicitly on logout to fully close the socket
export function disconnectSocket() {
  if (globalSocket) {
    globalSocket.disconnect()
    globalSocket = null
  }
}
