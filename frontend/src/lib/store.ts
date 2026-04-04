import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import Cookies from 'js-cookie'

// ── Theme Store ───────────────────────────────────────────────────────────────
interface ThemeState {
  dark: boolean
  setDark: (dark: boolean) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      dark: true,
      setDark: (dark) => set({ dark }),
      toggle: () => set({ dark: !get().dark }),
    }),
    { name: 'nn-theme' }
  )
)

// ── Auth Store ────────────────────────────────────────────────────────────────
// FIX: Use both _id and id to be compatible with backend responses.
//      Backend auth returns { _id, id, name, email, avatar }.
//      Both fields are populated for maximum compatibility.
// FIX: Added isDemo so DemoModeBanner renders when demo/activate is used.
interface User {
  _id: string
  id: string
  name: string
  email: string
  avatar?: string
  isDemo?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: any, token: string) => void
  logout: () => void
  isAuthenticated: () => boolean
  updateUser: (partial: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      setAuth: (rawUser: any, token: string) => {
        // Normalise: ensure both _id and id are present regardless of which the backend sent
        const user: User = {
          _id:    rawUser._id || rawUser.id || '',
          id:     rawUser.id  || rawUser._id || '',
          name:   rawUser.name   || '',
          email:  rawUser.email  || '',
          avatar: rawUser.avatar || '',
          // Preserve demo flag — demo/activate returns isDemo:true
          isDemo: rawUser.isDemo || rawUser.isDemoUser || false,
        }
        Cookies.set('nn_token', token, { expires: 7 })
        set({ user, token })
      },

      logout: () => {
        Cookies.remove('nn_token')
        set({ user: null, token: null })
      },

      isAuthenticated: () => {
        const { token } = get()
        return !!token && !!Cookies.get('nn_token')
      },

      updateUser: (partial) => {
        const { user } = get()
        if (user) set({ user: { ...user, ...partial } })
      },
    }),
    {
      name: 'nn-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)
