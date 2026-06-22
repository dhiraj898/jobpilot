import { create } from 'zustand'
import { api } from '../api/client'

interface User { id: string; email: string }
interface AuthStore {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  init: () => Promise<void>
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  token: localStorage.getItem('jp_token'),

  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { token, ...user } = res.data.data
    localStorage.setItem('jp_token', token)
    set({ token, user })
  },

  register: async (email, password) => {
    const res = await api.post('/auth/register', { email, password })
    const { token, ...user } = res.data.data
    localStorage.setItem('jp_token', token)
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem('jp_token')
    set({ user: null, token: null })
  },

  init: async () => {
    const token = localStorage.getItem('jp_token')
    if (!token) return
    try {
      const res = await api.get('/auth/me')
      set({ user: res.data.data, token })
    } catch {
      localStorage.removeItem('jp_token')
      set({ user: null, token: null })
    }
  }
}))
