<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../utils/request'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const loading = ref(false)
const refreshingId = ref(null)
const orders = ref([])
const statusFilter = ref('all')
const searchKeyword = ref('')
const sortMode = ref('newest')
const profile = ref(null)
const notices = ref([])
const noticesVisible = ref(false)
const unreadNoticeCount = ref(0)
const passwordVisible = ref(false)
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const passwordSaving = ref(false)
const detailVisible = ref(false)
const detailOrder = ref(null)
const detailLoading = ref(false)
const detailMessages = ref([])
const replyContent = ref('')
const replyImage = ref(null)
const sendingReply = ref(false)

const statusText = (status) => ({
  待处理: '待处理',
  pending: '待处理',
  处理中: '维修中',
  processing: '维修中',
  已完成: '已完成',
  finished: '已完成'
}[status] || status || '未知')

const fetchOrders = async () => {
  loading.value = true
  try {
    const response = await api.get('/maintenance/orders')
    orders.value = Array.isArray(response.data) ? response.data.map((order) => ({
      ...order,
      completionNoteDraft: order.completionNote || ''
    })) : []
  } finally {
    loading.value = false
  }
}

const stats = computed(() => {
  const result = { total: 0, pending: 0, processing: 0, finished: 0 }
  for (const order of orders.value) {
    result.total += 1
    if (order.status === '待处理' || order.status === 'pending') result.pending += 1
    else if (order.status === '处理中' || order.status === 'processing') result.processing += 1
    else if (order.status === '已完成' || order.status === 'finished') result.finished += 1
  }
  return result
})

const filteredOrders = computed(() => {
    const keyword = searchKeyword.value.trim().toLocaleLowerCase()
    const filtered = orders.value.filter((order) => {
      const status = statusFilter.value
      const matchesStatus =
        status === 'all' ||
        (status === 'pending' && (order.status === '待处理' || order.status === 'pending')) ||
        (status === 'processing' && (order.status === '处理中' || order.status === 'processing')) ||
        (status === 'finished' && (order.status === '已完成' || order.status === 'finished'))
      if (!matchesStatus) return false
      if (!keyword) return true
      return [order.id, order.title, order.location, order.building, order.room, order.desc, order.phone, order.user?.nickname]
        .some((value) => String(value || '').toLocaleLowerCase().includes(keyword))
    })
    return [...filtered].sort((left, right) => {
      if (sortMode.value === 'status') {
        const priority = (order) => (
          order.status === '待处理' || order.status === 'pending' ? 0 :
          order.status === '处理中' || order.status === 'processing' ? 1 : 2
        )
        return priority(left) - priority(right)
      }
      return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    })
  })

const fetchProfile = async () => {
    try {
      const response = await api.get('/maintenance/profile')
      profile.value = response.data
    } catch (error) {
      if (error && !error.requestHandled) ElMessage.error(error.message || '维修人员资料加载失败')
    }
  }

const fetchNotices = async () => {
    try {
      const response = await api.get('/maintenance/notices')
      notices.value = Array.isArray(response.data) ? response.data : []
      const lastSeen = localStorage.getItem('maintenanceNoticeSeenAt') || ''
      const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0
      unreadNoticeCount.value = notices.value.filter((item) =>
        item.createdAt && new Date(item.createdAt).getTime() > lastSeenTime).length
    } catch (error) {
      notices.value = []
    }
  }

const openNotices = () => {
    noticesVisible.value = true
    unreadNoticeCount.value = 0
    localStorage.setItem('maintenanceNoticeSeenAt', new Date().toISOString())
  }

const openProfile = async () => {
    await fetchProfile()
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    passwordVisible.value = true
  }

const savePassword = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm.value
    if (!currentPassword || !newPassword || !confirmPassword) {
      ElMessage.warning('请完整填写密码信息')
      return
    }
    if (newPassword !== confirmPassword) {
      ElMessage.warning('两次输入的新密码不一致')
      return
    }
    passwordSaving.value = true
    try {
      await api.put('/maintenance/password', { currentPassword, newPassword })
      ElMessage.success('密码修改成功，请妥善保管新密码')
      passwordVisible.value = false
    } finally {
      passwordSaving.value = false
    }
  }

const openDetail = async (order) => {
    detailVisible.value = true
    detailLoading.value = true
    detailOrder.value = order
    detailMessages.value = []
    replyContent.value = ''
    replyImage.value = null
    try {
      const [detailResponse, messageResponse] = await Promise.all([
        api.get(`/order/${order.id}`),
        api.get(`/order/${order.id}/messages`)
      ])
      detailOrder.value = detailResponse.data || order
      detailMessages.value = Array.isArray(messageResponse.data) ? messageResponse.data : []
    } finally {
      detailLoading.value = false
    }
  }

const openMap = (order) => {
    const source = detailOrder.value || order
    if (Number.isFinite(Number(source.latitude)) && Number.isFinite(Number(source.longitude))) {
      const url = `https://uri.amap.com/marker?position=${source.longitude},${source.latitude}&name=${encodeURIComponent(source.mapAddress || source.location || '报修地点')}&coordinate=gaode&callnative=0`
      window.open(url, '_blank')
    } else if (source.mapAddress || source.location) {
      const url = `https://uri.amap.com/search?keyword=${encodeURIComponent(source.mapAddress || source.location)}`
      window.open(url, '_blank')
    } else {
      ElMessage.warning('该工单暂无可导航地点')
    }
  }

const uploadReplyImage = async (upload) => {
    replyImage.value = upload.file
    upload.onSuccess({ success: true })
  }

const sendReply = async () => {
    if (!detailOrder.value) return
    const content = replyContent.value.trim()
    if (!content) {
      ElMessage.warning('请输入沟通内容')
      return
    }
    sendingReply.value = true
    try {
      const formData = new FormData()
      formData.append('content', content)
      if (replyImage.value) formData.append('image', replyImage.value)
      await api.post(`/order/${detailOrder.value.id}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      ElMessage.success('沟通消息已发送')
      replyContent.value = ''
      replyImage.value = null
      await openDetail(detailOrder.value)
    } finally {
      sendingReply.value = false
  }
}

const updateProgress = async (order, status) => {
  if (refreshingId.value) return
  if (status === 'finished' && !order.completionNoteDraft.trim()) {
    ElMessage.warning('请先填写维修处理结果')
    return
  }
  refreshingId.value = order.id
  try {
    await api.post(`/maintenance/orders/${order.id}/progress`, {
      status,
      completionNote: order.completionNoteDraft.trim()
    })
    ElMessage.success(status === '已完成' ? '工单已标记完成' : '已开始处理工单')
    await fetchOrders()
  } finally {
    refreshingId.value = null
  }
}

const uploadCompletionEvidence = async (upload, order) => {
  const formData = new FormData()
  formData.append('image', upload.file)
  try {
    const response = await api.post(
      `/maintenance/orders/${order.id}/completion-evidence`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    order.completionImgUrl = response.data.completionImgUrl
    ElMessage.success('完工照片上传成功')
    upload.onSuccess(response.data)
  } catch (error) {
    upload.onError(error)
  }
}

const logout = async () => {
  authStore.clearToken()
  await router.replace({ name: 'login' })
}

onMounted(async () => {
  await Promise.all([fetchOrders(), fetchProfile(), fetchNotices()])
})
</script>

<template>
  <main class="workbench-page">
    <header class="workbench-header">
      <div>
        <p class="eyebrow">CAMPUS REPAIR WORKBENCH</p>
        <h1>维修人员工作台</h1>
        <p>仅显示分派给当前账号的工单，请按实际处理进度更新状态。</p>
      </div>
      <div class="workbench-actions">
        <el-button @click="openNotices">
          通知
          <el-badge v-if="unreadNoticeCount" :value="unreadNoticeCount" class="notice-badge" />
        </el-button>
        <el-button @click="openProfile">个人资料 / 修改密码</el-button>
        <el-button :loading="loading" @click="fetchOrders">刷新</el-button>
        <el-button @click="logout">退出登录</el-button>
      </div>
    </header>

    <section class="workbench-stats">
      <article>
        <span>全部工单</span>
        <strong>{{ stats.total }}</strong>
      </article>
      <article class="stat-pending">
        <span>待处理</span>
        <strong>{{ stats.pending }}</strong>
      </article>
      <article class="stat-processing">
        <span>维修中</span>
        <strong>{{ stats.processing }}</strong>
      </article>
      <article class="stat-finished">
        <span>已完成</span>
        <strong>{{ stats.finished }}</strong>
      </article>
    </section>

    <section class="workbench-toolbar">
      <el-radio-group v-model="statusFilter" size="default">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="pending">待处理</el-radio-button>
        <el-radio-button value="processing">维修中</el-radio-button>
        <el-radio-button value="finished">已完成</el-radio-button>
      </el-radio-group>
      <el-input
        v-model="searchKeyword"
        clearable
        class="workbench-search"
        placeholder="搜索工单编号、标题、地点或报修人"
      />
      <el-select v-model="sortMode" class="workbench-sort">
        <el-option label="最新提交" value="newest" />
        <el-option label="状态优先" value="status" />
      </el-select>
    </section>

    <section v-loading="loading" class="workbench-orders">
      <el-empty v-if="!loading && !filteredOrders.length" description="当前没有符合条件的工单" />
      <article v-for="order in filteredOrders" :key="order.id" class="work-order-card">
        <header class="work-order-heading">
          <div>
            <span class="order-number">工单 #{{ order.id }}</span>
            <h2>{{ order.title }}</h2>
          </div>
          <el-tag :type="order.status === '已完成' || order.status === 'finished' ? 'success' : 'warning'">
            {{ statusText(order.status) }}
          </el-tag>
        </header>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="报修地点">
            {{ [order.building, order.floor && `${order.floor}层`, order.room].filter(Boolean).join(' ') || order.location || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="提交时间">
            {{ order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="报修人">
            {{ order.user?.nickname || '用户' }} · {{ order.phone || order.user?.phone || '未留电话' }}
          </el-descriptions-item>
          <el-descriptions-item label="故障类型">{{ order.category || '未分类' }}</el-descriptions-item>
          <el-descriptions-item label="故障描述" :span="2">{{ order.desc || '—' }}</el-descriptions-item>
          <el-descriptions-item v-if="order.additionalDescription" label="补充说明" :span="2">
            {{ order.additionalDescription }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.mapAddress" label="地图位置" :span="2">
            {{ order.mapAddress }}
            <span v-if="order.latitude && order.longitude">
              （{{ Number(order.latitude).toFixed(6) }}, {{ Number(order.longitude).toFixed(6) }}）
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="order.imgUrl || order.completionImgUrl" class="work-order-images">
          <el-image
            v-for="image in [order.imgUrl, order.completionImgUrl].filter(Boolean)"
            :key="image"
            :src="image"
            :preview-src-list="[order.imgUrl, order.completionImgUrl].filter(Boolean)"
            fit="cover"
          />
        </div>

        <div v-if="order.status === '处理中' || order.status === 'processing'" class="completion-form">
          <el-input
            v-model="order.completionNoteDraft"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="填写维修处理结果后再完成工单"
          />
          <el-upload
            :show-file-list="false"
            accept="image/jpeg,image/png,image/webp"
            :http-request="(upload) => uploadCompletionEvidence(upload, order)"
          >
            <el-button>上传完工照片（选填）</el-button>
          </el-upload>
        </div>

        <footer class="work-order-footer">
          <el-button plain @click="openDetail(order)">查看详情</el-button>
          <el-button
            v-if="order.latitude && order.longitude"
            plain
            @click="openMap(order)"
          >地图导航</el-button>
          <el-button
            v-if="order.status === '待处理' || order.status === 'pending'"
            type="primary"
            :loading="refreshingId === order.id"
            @click="updateProgress(order, '处理中')"
          >开始维修</el-button>
          <el-button
            v-else-if="order.status === '处理中' || order.status === 'processing'"
            type="success"
            :loading="refreshingId === order.id"
            @click="updateProgress(order, '已完成')"
          >完成工单</el-button>
          <span v-else class="completed-note">
            {{ order.completionNote || '维修已完成' }}
          </span>
        </footer>
      </article>
    </section>

    <el-dialog v-model="detailVisible" title="工单详情与处理记录" width="760px" destroy-on-close>
      <div v-loading="detailLoading">
        <template v-if="detailOrder">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="工单编号">#{{ detailOrder.id }}</el-descriptions-item>
            <el-descriptions-item label="工单状态">{{ statusText(detailOrder.status) }}</el-descriptions-item>
            <el-descriptions-item label="报修地点" :span="2">
              {{ detailOrder.location || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="故障描述" :span="2">{{ detailOrder.desc || '—' }}</el-descriptions-item>
            <el-descriptions-item label="补充说明" :span="2">{{ detailOrder.additionalDescription || '无' }}</el-descriptions-item>
            <el-descriptions-item label="预计完成">{{ detailOrder.expectedCompletionAt ? new Date(detailOrder.expectedCompletionAt).toLocaleString('zh-CN') : '暂未提供' }}</el-descriptions-item>
            <el-descriptions-item label="报修人">{{ detailOrder.user?.nickname || '用户' }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ detailOrder.phone || detailOrder.user?.phone || '未留电话' }}</el-descriptions-item>
            <el-descriptions-item label="故障类型">{{ detailOrder.aiCategory || '未分类' }}</el-descriptions-item>
          </el-descriptions>

          <el-button
            v-if="detailOrder.mapAddress || (detailOrder.latitude && detailOrder.longitude)"
            class="detail-map-button"
            plain
            @click="openMap(detailOrder)"
          >打开地图导航</el-button>

          <section v-if="detailOrder.history?.length" class="detail-timeline">
            <h3>处理记录</h3>
            <el-timeline>
              <el-timeline-item
                v-for="item in detailOrder.history"
                :key="item.id"
                :timestamp="item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : ''"
              >
                {{ item.eventLabel || item.eventType || '工单更新' }}
                <span v-if="item.remark">：{{ item.remark }}</span>
              </el-timeline-item>
            </el-timeline>
          </section>

          <section class="detail-messages">
            <h3>沟通记录</h3>
            <el-empty v-if="!detailMessages.length" description="暂无沟通记录" :image-size="56" />
            <article v-for="message in detailMessages" :key="message.id" class="detail-message">
              <header>
                <strong>{{ message.actorRole === 'maintenance' ? '维修人员' : message.actorRole === 'admin' ? '管理员' : '报修人' }}</strong>
                <time>{{ message.createdAt ? new Date(message.createdAt).toLocaleString('zh-CN') : '' }}</time>
              </header>
              <p>{{ message.content }}</p>
              <el-image v-if="message.imageUrl" :src="message.imageUrl" fit="cover" :preview-src-list="[message.imageUrl]" />
            </article>

            <el-input
              v-model="replyContent"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              placeholder="向报修人发送补充沟通"
            />
            <el-upload
              :show-file-list="false"
              accept="image/jpeg,image/png,image/webp"
              :http-request="uploadReplyImage"
            >
              <el-button plain>添加沟通图片（选填）</el-button>
            </el-upload>
            <el-button
              type="primary"
              :loading="sendingReply"
              :disabled="!replyContent.trim()"
              @click="sendReply"
            >发送沟通</el-button>
          </section>
        </template>
      </div>
    </el-dialog>

    <el-dialog v-model="passwordVisible" title="个人资料与密码" width="460px" destroy-on-close>
      <el-descriptions v-if="profile" :column="1" border>
        <el-descriptions-item label="姓名">{{ profile.name }}</el-descriptions-item>
        <el-descriptions-item label="账号">{{ profile.username }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ profile.phone || '未留电话' }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-position="top" class="password-form">
        <el-form-item label="当前密码">
          <el-input v-model="passwordForm.currentPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="savePassword">保存密码</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="noticesVisible" title="工单通知" width="560px" destroy-on-close>
      <el-empty v-if="!notices.length" description="暂无工单通知" />
      <article v-for="notice in notices" :key="notice.id" class="notice-entry">
        <strong>{{ notice.title }}</strong>
        <p>{{ notice.message }}</p>
        <time>{{ notice.createdAt ? new Date(notice.createdAt).toLocaleString('zh-CN') : '' }}</time>
      </article>
    </el-dialog>
  </main>
</template>

<style scoped>
.workbench-page {
  min-height: 100vh;
  padding: 32px;
  background: #f2f7f2;
  color: #294638;
}

.workbench-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto 24px;
}

.workbench-header h1 {
  margin: 6px 0;
  font-size: 28px;
}

.workbench-header p {
  color: #718775;
}

.workbench-header .eyebrow {
  margin: 0;
  color: #25845f;
  font-size: 12px;
  letter-spacing: 1px;
}

.workbench-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.workbench-orders {
  display: grid;
  max-width: 1100px;
  margin: auto;
  gap: 18px;
}

.work-order-card {
  padding: 22px;
  border: 1px solid #e1ece1;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 24px rgb(48 91 56 / 5%);
}

.work-order-heading,
.work-order-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.work-order-heading h2 {
  margin: 6px 0 0;
  font-size: 20px;
}

.order-number,
.completed-note {
  color: #718775;
  font-size: 13px;
}

.work-order-images {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.work-order-images .el-image {
  width: 110px;
  height: 110px;
  border-radius: 8px;
}

.completion-form {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.work-order-footer {
  justify-content: flex-end;
  margin: 18px 0 0;
}

@media (max-width: 700px) {
  .workbench-page {
    padding: 18px 12px;
  }

  .workbench-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .workbench-actions {
    flex-wrap: wrap;
  }

  .work-order-card {
    padding: 14px;
  }
}

.workbench-page {
  background: #f7f9f8;
  color: #444444;
}

.workbench-header {
  max-width: 1120px;
  min-height: 148px;
  margin-bottom: 20px;
  padding: 24px 28px;
  border: 1px solid #edf1ef;
  border-radius: 18px;
  background: linear-gradient(120deg, #edf5f1, #f8fbfa 74%);
  box-shadow: 0 10px 28px rgba(49, 88, 70, 0.07);
}

.workbench-header h1 {
  color: #222222;
  font-size: 28px;
}

.workbench-header p {
  color: #929891;
}

.workbench-header .eyebrow {
  color: #759886;
  font-size: 12px;
  letter-spacing: 1.2px;
}

.workbench-orders {
  max-width: 1120px;
  gap: 16px;
}

.work-order-card {
  padding: 24px;
  border: 1px solid #edf1ef;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(49, 88, 70, 0.07);
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.work-order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 30px rgba(49, 88, 70, 0.09);
}

.work-order-heading h2 {
  color: #263d34;
  font-size: 20px;
}

.order-number,
.completed-note {
  color: #929891;
}

.work-order-images .el-image {
  border: 1px solid #edf1ef;
  border-radius: 12px;
  box-shadow: 0 5px 14px rgba(49, 88, 70, 0.06);
}

.completion-form {
  padding: 16px;
  border: 1px solid #edf1ef;
  border-radius: 12px;
  background: #f8faf9;
}

.work-order-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #edf1ef;
}

.workbench-page {
  position: relative;
  background:
    radial-gradient(circle at 14px 14px, rgba(105,168,145,0.045) 1px, transparent 1.2px),
    linear-gradient(145deg, #f5f8f7, #f8faf9);
  background-size: 26px 26px, auto;
}

.workbench-header {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(223, 235, 228, 0.94);
  border-radius: 20px;
  background:
    radial-gradient(circle at 88% 28%, rgba(255,255,255,0.86) 0 8px, transparent 9px),
    linear-gradient(118deg, #e1f0e8, #edf4f7 64%, #faf0ea);
  box-shadow: 0 14px 34px rgba(67, 112, 91, 0.09);
}

.workbench-header::after {
  position: absolute;
  right: 36px;
  bottom: -48px;
  width: 128px;
  height: 128px;
  border: 14px solid rgba(255,255,255,0.30);
  border-radius: 50%;
  content: '';
}

.workbench-header h1 {
  color: #233d33;
  text-shadow: 0 2px 10px rgba(78,125,103,0.08);
}

.workbench-header p {
  color: #88958e;
}

.workbench-header .eyebrow {
  color: #668f7b;
  font-weight: 700;
}

.workbench-actions .el-button {
  border-radius: 10px;
  box-shadow: 0 5px 12px rgba(67,112,91,0.06);
}

.work-order-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(223,235,228,0.94);
  border-radius: 18px;
  background: linear-gradient(145deg, #ffffff, #ffffff 70%, #f7faf8);
  box-shadow: 0 14px 34px rgba(67,112,91,0.09), 0 3px 10px rgba(67,112,91,0.055);
}

.work-order-card::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, #91bda9, #aebfd2, #dac1b6);
  content: '';
}

.work-order-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 38px rgba(67,112,91,0.12);
}

.work-order-heading h2 {
  color: #263d34;
}

.order-number,
.completed-note {
  color: #929891;
}

.work-order-images .el-image {
  border: 1px solid #e8efea;
  box-shadow: 0 7px 18px rgba(67,112,91,0.09);
}

.completion-form {
  border: 1px solid #e8efea;
  border-radius: 14px;
  background: linear-gradient(145deg, #f8fbf9, #f3f7f8);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.82);
}

.work-order-footer {
  border-top: 1px solid #edf2ef;
}

.workbench-page .el-descriptions {
  overflow: hidden;
  border: 1px solid #edf2ef;
  border-radius: 14px;
}

.workbench-page .el-button--primary {
  border: 0;
  background: linear-gradient(110deg, #72a890, #82b6a3);
  box-shadow: 0 8px 18px rgba(105,168,145,0.18);
}

.workbench-page .el-button--success {
  border: 0;
  background: linear-gradient(110deg, #83aaa2, #76aab0);
  box-shadow: 0 8px 18px rgba(114,169,173,0.16);
}

.workbench-stats {
  display: grid;
  max-width: 1120px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 0 auto 16px;
}

.workbench-stats article {
  position: relative;
  overflow: hidden;
  min-height: 92px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px 20px;
  border: 1px solid #e5ede8;
  border-radius: 16px;
  background: linear-gradient(145deg, #ffffff, #f7faf8);
  box-shadow: 0 8px 20px rgba(67,112,91,0.06);
}

.workbench-stats article::after {
  position: absolute;
  right: -24px;
  bottom: -28px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(105,168,145,0.09);
  content: '';
}

.workbench-stats span {
  color: #929891;
  font-size: 13px;
}

.workbench-stats strong {
  margin-top: 6px;
  color: #526c60;
  font-size: 28px;
}

.workbench-stats .stat-pending {
  background: linear-gradient(145deg, #ffffff, #fff8ed);
}

.workbench-stats .stat-pending strong {
  color: #b37d48;
}

.workbench-stats .stat-processing {
  background: linear-gradient(145deg, #ffffff, #f1f7f4);
}

.workbench-stats .stat-processing strong {
  color: #668d7c;
}

.workbench-stats .stat-finished {
  background: linear-gradient(145deg, #ffffff, #eef7f7);
}

.workbench-stats .stat-finished strong {
  color: #5f9291;
}

.workbench-toolbar {
  max-width: 1120px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 auto 16px;
  padding: 12px;
  border: 1px solid #e5ede8;
  border-radius: 16px;
  background: rgba(255,255,255,0.94);
  box-shadow: 0 8px 20px rgba(67,112,91,0.055);
}

.workbench-search {
  flex: 1;
}

.workbench-sort {
  width: 150px;
}

.notice-badge {
  margin-left: 4px;
}

.detail-map-button {
  margin-top: 14px;
}

.detail-timeline,
.detail-messages {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid #e7eee9;
  border-radius: 14px;
  background: #f8faf9;
}

.detail-timeline h3,
.detail-messages h3 {
  margin: 0 0 14px;
  color: #365846;
  font-size: 16px;
}

.detail-message {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid #e7eee9;
  border-radius: 12px;
  background: #ffffff;
}

.detail-message header {
  display: flex;
  justify-content: space-between;
  color: #668577;
  font-size: 12px;
}

.detail-message p {
  margin: 8px 0;
  color: #44534b;
  line-height: 1.6;
}

.detail-message .el-image {
  width: 120px;
  height: 120px;
  border-radius: 10px;
}

.detail-messages .el-input,
.detail-messages .el-upload,
.detail-messages .el-button {
  margin-top: 12px;
}

.password-form {
  margin-top: 16px;
}

.notice-entry {
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid #e7eee9;
  border-radius: 12px;
  background: linear-gradient(145deg, #ffffff, #f7faf8);
}

.notice-entry strong {
  color: #365846;
}

.notice-entry p {
  margin: 8px 0;
  color: #59675f;
  line-height: 1.6;
}

.notice-entry time {
  color: #929891;
  font-size: 12px;
}

@media (max-width: 900px) {
  .workbench-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workbench-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .workbench-search,
  .workbench-sort {
    width: 100%;
  }
}

.workbench-page::before,
.workbench-page::after {
  position: fixed;
  z-index: 0;
  border: 1px solid rgba(139,183,165,0.10);
  border-radius: 50%;
  content: '';
  pointer-events: none;
}

.workbench-page::before {
  top: 96px;
  left: -118px;
  width: 180px;
  height: 180px;
  box-shadow: 0 0 0 20px rgba(255,255,255,0.18);
}

.workbench-page::after {
  right: -110px;
  bottom: 36px;
  width: 150px;
  height: 150px;
  border-color: rgba(157,189,208,0.12);
  box-shadow: 0 0 0 18px rgba(255,255,255,0.16);
}

.workbench-header,
.workbench-orders {
  position: relative;
  z-index: 1;
}

.workbench-header::before {
  position: absolute;
  top: 18px;
  right: 132px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #bdd5c9;
  box-shadow: 14px 0 0 #d5e1d9, 28px 0 0 #d9bca9;
  content: '';
  opacity: 0.82;
}
</style>
