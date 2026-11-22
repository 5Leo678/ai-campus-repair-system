import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import Login from '../views/Login.vue'
import OrderManage from '../views/OrderManage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { public: true }
    },
    {
      path: '/',
      name: 'orders',
      component: OrderManage,
      meta: { requiresAdmin: true }
    },
    {
      path: '/workbench',
      name: 'maintenance-workbench',
      component: () => import('../views/MaintenanceWorkbench.vue'),
      meta: { requiresMaintenance: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 所有后台管理路由要求已验证的管理员令牌。
router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresMaintenance && authStore.role !== 'maintenance') {
    return authStore.token ? { name: 'orders' } : { name: 'login' }
  }
  if (to.meta.requiresAdmin && !authStore.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin && authStore.role !== 'admin') {
    return authStore.role === 'maintenance' ? { name: 'maintenance-workbench' } : { name: 'login' }
  }

  if (to.name === 'login' && authStore.token) {
    return authStore.role === 'maintenance'
      ? { name: 'maintenance-workbench' }
      : { name: 'orders' }
  }
})

export default router
