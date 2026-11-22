import { defineStore } from 'pinia'

const TOKEN_KEY = 'campus-repair-admin-token'

const tokenRole = (token) => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(payload)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)).role || ''
  } catch {
    return ''
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    role: tokenRole(localStorage.getItem(TOKEN_KEY) || '')
  }),

  actions: {
    setToken(token) {
      this.token = token
      this.role = tokenRole(token || '')
      if (token) {
        localStorage.setItem(TOKEN_KEY, token)
      } else {
        localStorage.removeItem(TOKEN_KEY)
      }
    },

    clearToken() {
      this.setToken('')
    }
  }
})
