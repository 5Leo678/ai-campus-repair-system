<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../utils/request'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const form = ref({
  username: '',
  password: ''
})
const accountType = ref('admin')
const loading = ref(false)

// 管理员登录使用后端现有账号密码接口，不接受客户端手动粘贴 token。
const handleLogin = async () => {
  const username = form.value.username.trim()
  const password = form.value.password
  if (!username || !password) {
    ElMessage.warning('请输入管理员账号和密码')
    return
  }

  loading.value = true
  try {
    const endpoint = accountType.value === 'maintenance'
      ? '/maintenance/auth/login'
      : '/auth/adminlogin'
    const response = await api.post(endpoint, { username, password })
    const token = response.data?.token
    if (!token) {
      ElMessage.error('登录响应中未包含管理员 token')
      return
    }

    authStore.setToken(token)
    ElMessage.success(response.msg || '登录成功')
    const defaultRoute = response.data?.user?.role === 'maintenance' ? '/workbench' : '/'
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : defaultRoute
    await router.replace(redirect)
  } catch (error) {
    // 请求错误由 Axios 拦截器统一提示。
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div class="brand-mark">报</div>
      <p class="eyebrow">CAMPUS REPAIR SYSTEM</p>
      <h1>{{ accountType === 'admin' ? '管理后台' : '维修人员工作台' }}</h1>
      <p class="login-description">登录后进入对应的工单处理界面</p>

      <el-radio-group v-model="accountType" class="login-account-type">
        <el-radio-button value="admin">管理员</el-radio-button>
        <el-radio-button value="maintenance">维修人员</el-radio-button>
      </el-radio-group>
      <el-form :model="form" @submit.prevent="handleLogin">
        <el-form-item :label="accountType === 'admin' ? '管理员账号' : '维修人员账号'">
          <el-input
            v-model="form.username"
            autocomplete="username"
            :placeholder="accountType === 'admin' ? '请输入管理员账号' : '请输入维修人员账号'"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
            placeholder="请输入登录密码"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button
          class="login-button"
          type="primary"
          :loading="loading"
          @click="handleLogin"
        >
          登 录
        </el-button>
      </el-form>
    </section>
  </main>
</template>
