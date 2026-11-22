import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'
import { useAuthStore } from '../stores/auth'

// 只配置后端现有 API 的基础地址，不在这里定义或代理新的接口路径。
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && body.code !== undefined &&
        ![200, 201].includes(Number(body.code))) {
      const error = new Error(body.msg || '请求失败')
      error.response = response
      if (Number(body.code) === 401) {
        const authStore = useAuthStore()
        authStore.clearToken()
        ElMessage.warning(body.msg || '登录已过期，请重新登录')
        if (router.currentRoute.value.name !== 'login') {
          router.replace({ name: 'login' })
        }
      } else {
        ElMessage.error(error.message)
      }
      return Promise.reject(error)
    }
    return body
  },
  (error) => {
    if (error.response?.status === 401 || Number(error.response?.data?.code) === 401) {
      const authStore = useAuthStore()
      authStore.clearToken()
      ElMessage.warning(error.response?.data?.msg || '登录已过期，请重新登录')
      if (router.currentRoute.value.name !== 'login') {
        router.replace({ name: 'login' })
      }
      return Promise.reject(error)
    }

    const message = error.response?.data?.msg || error.message || '网络请求失败'
    ElMessage.error(message)
    return Promise.reject(error)
  }
)

export default api
