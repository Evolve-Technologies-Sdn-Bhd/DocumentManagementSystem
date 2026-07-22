import axios from 'axios'
import {
  failUploadProgress,
  finishUploadProgress,
  startUploadProgress,
  updateUploadProgress
} from '../utils/uploadProgressStore'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({ baseURL })

let refreshing = null

const isFormDataPayload = (data) => {
  try {
    return typeof FormData !== 'undefined' && data instanceof FormData
  } catch {
    return false
  }
}

const getUploadLabel = (cfg) => {
  const url = String(cfg?.url || '')
  if (url.includes('/documents/drafts/submit-for-review')) return 'Submitting for review...'
  if (url.includes('/workflow/approve/first/') || url.includes('/workflow/approve/second/')) return 'Submitting approval...'
  if (url.includes('/workflow/review/')) return 'Submitting review...'
  if (url.includes('/documents/bulk-import')) return 'Importing documents...'
  if (url.includes('/user/profile')) return 'Uploading profile...'
  if (url.includes('/templates')) return 'Uploading template...'
  if (url.includes('/documents/') && url.includes('/upload')) return 'Uploading document...'
  return 'Uploading...'
}

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`

  if (isFormDataPayload(cfg.data)) {
    cfg._isUpload = true
    if (!cfg._uploadProgressStarted) {
      cfg._uploadProgressStarted = true
      startUploadProgress(getUploadLabel(cfg))
    }
    if (!cfg.onUploadProgress) {
      cfg.onUploadProgress = (evt) => {
        const loaded = typeof evt?.loaded === 'number' ? evt.loaded : 0
        const total = typeof evt?.total === 'number' ? evt.total : 0
        updateUploadProgress(loaded, total)
      }
    }
  }
  return cfg
})

api.interceptors.response.use(
  (res) => {
    if (res?.config?._isUpload) finishUploadProgress()
    return res
  },
  async (error) => {
    const status = error?.response?.status
    const original = error?.config

    if (original?._isUpload) {
      failUploadProgress()
    }

    if (!original || status !== 401) {
      return Promise.reject(error)
    }

    const url = String(original.url || '')
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/verify-reset-code') ||
      url.includes('/auth/reset-password-code') ||
      url.includes('/auth/refresh-token') ||
      url.includes('/auth/verify-2fa') ||
      url.includes('/auth/resend-2fa')

    if (isAuthEndpoint || original._retry) {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return Promise.reject(error)
    }

    original._retry = true

    try {
      if (!refreshing) {
        refreshing = axios
          .post(
            `${baseURL}/auth/refresh-token`,
            { refreshToken },
            { headers: { 'Content-Type': 'application/json' } }
          )
          .then((r) => {
            const data = r?.data?.data || r?.data || {}
            const nextAccess =
              data.accessToken || data.token || data?.tokens?.accessToken || data?.tokens?.token
            const nextRefresh =
              data.refreshToken || data?.tokens?.refreshToken

            if (nextAccess) localStorage.setItem('token', nextAccess)
            if (nextRefresh) localStorage.setItem('refreshToken', nextRefresh)

            return nextAccess
          })
          .finally(() => {
            refreshing = null
          })
      }

      const nextAccess = await refreshing
      if (nextAccess) {
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${nextAccess}`
      }

      return api.request(original)
    } catch (refreshErr) {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      return Promise.reject(refreshErr)
    }
  }
)

export default api
