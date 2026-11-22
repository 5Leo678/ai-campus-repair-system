<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DataAnalysis,
  Delete,
  Edit,
  Expand,
  Fold,
  ChatDotRound,
  Download,
  Files,
  Plus,
  Refresh,
  Search,
  Setting,
  Tickets,
  View
} from '@element-plus/icons-vue'
import api from '../utils/request'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const loading = ref(false)
const statsLoading = ref(false)
const staffLoading = ref(false)
const reviewsLoading = ref(false)
const catalogsLoading = ref(false)
const auditLoading = ref(false)
const slaSaving = ref(false)
const staffSaving = ref(false)
const saving = ref(false)
const deletingId = ref(null)
const orders = ref([])
const viewPage = ref(1)
const sidebarCollapsed = ref(false)
const total = ref(0)
const page = ref(1)
const size = ref(10)
const statusFilter = ref('')
const searchKeyword = ref('')
const categoryFilter = ref('')
const locationFilter = ref('')
const dateRange = ref([])
const sortFilter = ref('newest')
const stats = ref(null)
const exportLoading = ref(false)
const aiInsights = ref(null)
const aiInsightsLoading = ref(false)
const aiAnalyzingOrderId = ref(null)
const slaAlerts = ref([])
const slaSettings = reactive({ pendingHours: 24, processingHours: 72 })
const slaSettingsVisible = ref(false)
const workload = ref({ staff: [], totalOrders: 0, unassignedCount: 0 })
const reviews = ref([])
const reviewsTotal = ref(0)
const reviewsPage = ref(1)
const reviewsSize = ref(10)
const reviewsSearchKeyword = ref('')
const catalogEntries = ref([])
const catalogSearchKeyword = ref('')
const catalogDialogVisible = ref(false)
const catalogForm = reactive({ id: null, type: 'category', value: '' })
const auditLogs = ref([])
const auditTotal = ref(0)
const auditPage = ref(1)
const auditSize = ref(20)
const auditSearchKeyword = ref('')
const followupDialogVisible = ref(false)
const followupReview = ref(null)
const followupNote = ref('')
const completionImageUrl = ref('')
const maintenanceStaff = ref([])
const staffSearchKeyword = ref('')
const staffDialogVisible = ref(false)
const editingStaffId = ref(null)
const staffHasAccount = ref(false)
const locationQrVisible = ref(false)
const locationQrLoading = ref(false)
const locationQrDataUrl = ref('')
const locationQrForm = reactive({ building: '', floor: '', room: '' })
const editVisible = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailOrder = ref(null)
const detailMessages = ref([])
const replyMessage = ref('')
const sendingReply = ref(false)
const detailMapUrl = computed(() => {
  const latitude = Number(detailOrder.value?.latitude)
  const longitude = Number(detailOrder.value?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return ''
  }
  const position = `${longitude},${latitude}`
  const name = encodeURIComponent(detailOrder.value?.mapAddress || '报修地点')
  return `https://uri.amap.com/marker?position=${position}&name=${name}&coordinate=gaode&callnative=0`
})
const feedbackTypeLabel = (value) => ({
  quality: '维修质量',
  communication: '沟通服务',
  speed: '处理速度',
  result: '问题解决',
  other: '其他'
}[value] || '未选择')
const staffForm = reactive({
  name: '',
  type: 'person',
  phone: '',
  description: '',
  username: '',
  password: ''
})
const filteredMaintenanceStaff = computed(() => {
  const keyword = staffSearchKeyword.value.trim().toLocaleLowerCase()
  if (!keyword) return maintenanceStaff.value

  return maintenanceStaff.value.filter((staff) => {
    const typeLabel = staff.type === 'team' ? '维修组' : '维修人员'
    return [staff.name, staff.phone, staff.description, typeLabel]
      .some((value) => String(value || '').toLocaleLowerCase().includes(keyword))
  })
})

const statusOptions = [
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '维修中' },
  { value: 'finished', label: '已完成' }
]
const categoryOptions = computed(() => {
  const activeCatalog = catalogEntries.value
    .filter((entry) => entry.type === 'category' && entry.active)
    .map((entry) => entry.value)
  const historicalCategories = (stats.value?.categories || []).map((item) => item.category)
  return [...new Set([...activeCatalog, ...historicalCategories])].filter(Boolean)
})

const editForm = reactive({
  id: null,
  title: '',
  status: 'pending',
  adminRemark: '',
  assignedTo: '',
  assignedStaffId: null,
  completionNote: ''
})
const assigneeSelection = computed({
  get: () => editForm.assignedStaffId || editForm.assignedTo,
  set: (value) => {
    const matchedStaff = maintenanceStaff.value.find((staff) => staff.id === Number(value))
    if (matchedStaff) {
      editForm.assignedStaffId = matchedStaff.id
      editForm.assignedTo = matchedStaff.name
    } else {
      editForm.assignedStaffId = null
      editForm.assignedTo = typeof value === 'string' ? value : ''
    }
  }
})

const statusApiValue = (status) => ({
  待处理: 'pending',
  处理中: 'processing',
  已完成: 'finished',
  pending: 'pending',
  processing: 'processing',
  finished: 'finished'
}[status] || '')

const statusLabel = (status) => ({
  待处理: '待处理',
  处理中: '维修中',
  已完成: '已完成',
  pending: '待处理',
  processing: '维修中',
  finished: '已完成'
}[status] || status || '未知')

const statusType = (status) => ({
  待处理: 'warning',
  pending: 'warning',
  处理中: 'primary',
  processing: 'primary',
  已完成: 'success',
  finished: 'success'
}[status] || 'info')

const isCompletedOrder = (status) => ['已完成', 'finished', 2, '2'].includes(status)

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

const formatUserFacingText = (value) => typeof value === 'string'
  ? value.replace(/学生/g, '用户')
  : value

const auditActionLabels = {
  'order.status.update': '更新工单状态',
  'order.assign': '分派维修人员',
  'order.remark.update': '更新工单备注',
  'order.delete': '删除已完成工单',
  'order.reopen': '重新开启工单',
  'order.completion.evidence': '上传完工照片',
  'order.ai.reanalyze': '重新分析工单',
  'sla.update': '调整处理时限',
  'report.export': '导出工单报表',
  'review.followup': '跟进用户评价',
  'catalog.create': '新增报修目录',
  'catalog.activate': '重新启用报修目录',
  'catalog.update': '修改报修目录',
  'catalog.delete': '停用报修目录',
  'maintenance.create': '新增维修人员/维修组',
  'maintenance.update': '修改维修人员/维修组',
  'maintenance.delete': '删除维修人员/维修组'
}

const auditTargetLabels = {
  order: '工单',
  orders: '工单报表',
  settings: '系统设置',
  review: '用户评价',
  catalog: '报修目录',
  maintenance_staff: '维修人员/维修组'
}

const auditStatusLabels = {
  待处理: '待处理',
  处理中: '维修中',
  已完成: '已完成',
  pending: '待处理',
  processing: '维修中',
  finished: '已完成'
}

const formatAuditTarget = (row) => {
  const label = auditTargetLabels[row.targetType] || row.targetType || '系统'
  if (row.targetId && row.targetType !== 'orders' && row.targetType !== 'settings') {
    return `${label} #${row.targetId}`
  }
  return row.targetId && row.targetType === 'settings'
    ? `${label}（${row.targetId === 'sla' ? '工单处理时限' : row.targetId}）`
    : label
}

const formatAuditDetails = (rawDetails) => {
  if (!rawDetails) return '—'
  let details = rawDetails
  if (typeof rawDetails === 'string') {
    try {
      details = JSON.parse(rawDetails)
    } catch {
      return rawDetails
    }
  }
  if (!details || typeof details !== 'object' || Array.isArray(details)) return String(details)

  const parts = []
  if (details.count !== undefined) parts.push(`导出 ${details.count} 条工单`)
  if (details.pendingHours !== undefined) parts.push(`待处理时限：${details.pendingHours} 小时`)
  if (details.processingHours !== undefined) parts.push(`维修中时限：${details.processingHours} 小时`)
  if (details.status !== undefined) parts.push(`状态：${auditStatusLabels[details.status] || details.status}`)
  if (details.assignedTo !== undefined) parts.push(`负责人：${details.assignedTo || '未分派'}`)
  if (details.adminRemark) parts.push(`管理员备注：${details.adminRemark}`)
  if (details.completionNote) parts.push(`完工说明：${details.completionNote}`)
  if (details.previousStatus !== undefined) {
    parts.push(`原状态：${auditStatusLabels[details.previousStatus] || details.previousStatus}`)
  }
  if (details.reason) parts.push(`重开原因：${details.reason}`)
  if (details.title) parts.push(`工单：${details.title}`)
  if (details.name) parts.push(`名称：${details.name}`)
  if (details.type) {
    const typeLabel = { category: '故障类型', building: '楼栋', person: '维修人员', team: '维修组' }
    parts.push(`类别：${typeLabel[details.type] || details.type}`)
  }
  if (details.value) parts.push(`目录项：${details.value}`)
  if (details.phone) parts.push(`电话：${details.phone}`)
  if (details.description) parts.push(`说明：${details.description}`)
  if (details.note) parts.push(`跟进内容：${details.note}`)
  if (details.image) parts.push('完工照片已上传')
  return parts.length ? parts.join('；') : '操作已完成'
}

const buildOrderFilterParams = () => {
  const params = {}
  if (statusFilter.value) params.status = statusFilter.value
  if (categoryFilter.value) params.category = categoryFilter.value
  if (locationFilter.value.trim()) params.location = locationFilter.value.trim()
  if (dateRange.value?.[0]) {
    params.from = dateRange.value[0]
    params.to = dateRange.value[1]
  }
  if (sortFilter.value) params.sort = sortFilter.value
  const keyword = searchKeyword.value.trim()
  if (keyword) params.q = keyword
  return params
}

// 通过管理员分页接口读取工单，按接口契约传 page、size 和可选 status。
const fetchOrders = async () => {
  loading.value = true
  try {
    const params = { ...buildOrderFilterParams(), page: page.value, size: size.value }
    const response = await api.get('/order/all', { params })
    const data = response.data || {}
    orders.value = Array.isArray(data.list) ? data.list : []
    total.value = Number(data.total) || 0
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  statsLoading.value = true
  try {
    const response = await api.get('/order/stats')
    stats.value = response.data
  } finally {
    statsLoading.value = false
  }
}

const fetchAiInsights = async () => {
  aiInsightsLoading.value = true
  try {
    const response = await api.get('/admin/ai/insights')
    aiInsights.value = response.data
  } finally {
    aiInsightsLoading.value = false
  }
}

const fetchOverview = async () => {
  const [statsResponse, slaResponse, settingsResponse, workloadResponse, catalogResponse, aiResponse] = await Promise.all([
    api.get('/order/stats'),
    api.get('/order/sla-alerts'),
    api.get('/order/sla-settings'),
    api.get('/maintenance-staff/workload'),
    api.get('/admin/catalog'),
    api.get('/admin/ai/insights')
  ])
  stats.value = statsResponse.data
  slaAlerts.value = slaResponse.data?.list || []
  Object.assign(slaSettings, settingsResponse.data || {})
  workload.value = workloadResponse.data || { staff: [], totalOrders: 0, unassignedCount: 0 }
  catalogEntries.value = Array.isArray(catalogResponse.data) ? catalogResponse.data : []
  aiInsights.value = aiResponse.data || null
}

const fetchMaintenanceStaff = async () => {
  staffLoading.value = true
  try {
    const response = await api.get('/maintenance-staff')
    maintenanceStaff.value = Array.isArray(response.data) ? response.data : []
  } finally {
    staffLoading.value = false
  }
}

const fetchReviews = async () => {
  reviewsLoading.value = true
  try {
    const response = await api.get('/order/reviews', {
      params: {
        page: reviewsPage.value,
        size: reviewsSize.value,
        q: reviewsSearchKeyword.value.trim() || undefined
      }
    })
    const data = response.data || {}
    reviews.value = Array.isArray(data.list) ? data.list : []
    reviewsTotal.value = Number(data.total) || 0
    reviewsAverage.value = Number(data.averageRating) || 0
    reviewsLowCount.value = Number(data.lowRatingCount) || 0
  } finally {
    reviewsLoading.value = false
  }
}

const reviewsAverage = ref(0)
const reviewsLowCount = ref(0)
const filteredCatalogEntries = computed(() => {
  const keyword = catalogSearchKeyword.value.trim().toLocaleLowerCase()
  if (!keyword) return catalogEntries.value
  return catalogEntries.value.filter((entry) => {
    const typeLabel = entry.type === 'category' ? '故障类型' : '报修楼栋'
    const statusLabel = entry.active ? '启用' : '已停用'
    return [entry.value, entry.type, typeLabel, statusLabel]
      .some((value) => String(value || '').toLocaleLowerCase().includes(keyword))
  })
})

const fetchCatalog = async () => {
  catalogsLoading.value = true
  try {
    const response = await api.get('/admin/catalog')
    catalogEntries.value = Array.isArray(response.data) ? response.data : []
  } finally {
    catalogsLoading.value = false
  }
}

const fetchAuditLogs = async () => {
  auditLoading.value = true
  try {
    const response = await api.get('/admin/audit-logs', {
      params: {
        page: auditPage.value,
        size: auditSize.value,
        q: auditSearchKeyword.value.trim() || undefined
      }
    })
    auditLogs.value = response.data?.list || []
    auditTotal.value = Number(response.data?.total) || 0
  } finally {
    auditLoading.value = false
  }
}

const handleViewPageChange = async (nextPage) => {
  viewPage.value = nextPage
  try {
    if (nextPage === 1) {
      await fetchOverview()
    } else if (nextPage === 2) {
      await fetchOrders()
    } else if (nextPage === 3) {
      await fetchMaintenanceStaff()
    } else if (nextPage === 4) {
      await fetchReviews()
    } else if (nextPage === 5) {
      await fetchCatalog()
    } else {
      await fetchAuditLogs()
    }
  } catch (error) {
    console.error('切换工单管理页面失败:', error)
  }
}

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const openStaffDialog = (staff = null) => {
  editingStaffId.value = staff?.id ?? null
  staffHasAccount.value = Boolean(staff?.username)
  Object.assign(staffForm, {
    name: staff?.name ?? '',
    type: staff?.type ?? 'person',
    phone: staff?.phone ?? '',
    description: staff?.description ?? '',
    username: staff?.username ?? '',
    password: ''
  })
  staffDialogVisible.value = true
}

const openLocationQrDialog = () => {
  const firstBuilding = catalogEntries.value.find((entry) => entry.type === 'building' && entry.active)?.value || ''
  Object.assign(locationQrForm, { building: firstBuilding, floor: '', room: '' })
  locationQrDataUrl.value = ''
  locationQrVisible.value = true
}

const generateLocationQr = async () => {
  const building = locationQrForm.building.trim()
  const floor = locationQrForm.floor.trim()
  const room = locationQrForm.room.trim()
  if (!building) {
    ElMessage.warning('请选择或填写楼栋')
    return
  }
  locationQrLoading.value = true
  try {
    const { default: QRCode } = await import('qrcode')
    const payload = {
      building,
      ...(floor ? { floor } : {}),
      ...(room ? { room } : {})
    }
    const content = `campus-repair-location:v1:${encodeURIComponent(JSON.stringify(payload))}`
    locationQrDataUrl.value = await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#173f2b', light: '#ffffff' }
    })
  } catch (error) {
    ElMessage.error(error.message || '地点二维码生成失败')
  } finally {
    locationQrLoading.value = false
  }
}

const recommendAssignee = () => {
  const availableStaff = workload.value.staff
    .filter((member) => member.type === 'person' && member.username)
    .sort((left, right) => {
      const activeDifference =
        (left.pending + left.processing) - (right.pending + right.processing)
      if (activeDifference) return activeDifference
      return (left.averageResolutionHours ?? Number.POSITIVE_INFINITY) -
        (right.averageResolutionHours ?? Number.POSITIVE_INFINITY)
    })
  const recommended = availableStaff[0]
  if (!recommended) {
    ElMessage.info('暂无已开通工作台账号的维修人员，请先在维修人员管理中创建账号')
    return
  }
  assigneeSelection.value = recommended.id
  ElMessage.success(`推荐负责人：${recommended.name}（当前待处理/维修中 ${recommended.pending + recommended.processing} 单）`)
}

const saveSlaSettings = async () => {
  slaSaving.value = true
  try {
    await api.put('/order/sla-settings', { ...slaSettings })
    ElMessage.success('工单处理时限已更新')
    slaSettingsVisible.value = false
    await fetchOverview()
  } finally {
    slaSaving.value = false
  }
}

const exportOrders = async () => {
  exportLoading.value = true
  try {
    const response = await api.get('/reports/orders.csv', {
      params: buildOrderFilterParams(),
      responseType: 'blob'
    })
    const url = URL.createObjectURL(response)
    const link = document.createElement('a')
    link.href = url
    link.download = 'repair-orders.csv'
    link.click()
    URL.revokeObjectURL(url)
  } finally {
    exportLoading.value = false
  }
}

const openCatalogDialog = (entry = null) => {
  Object.assign(catalogForm, {
    id: entry?.id ?? null,
    type: entry?.type ?? 'category',
    value: entry?.value ?? ''
  })
  catalogDialogVisible.value = true
}

const saveCatalogEntry = async () => {
  const value = catalogForm.value.trim()
  if (!value) {
    ElMessage.warning('请输入目录名称')
    return
  }
  const payload = { type: catalogForm.type, value }
  if (catalogForm.id) {
    await api.put(`/admin/catalog/${catalogForm.id}`, payload)
    ElMessage.success('目录项已更新')
  } else {
    await api.post('/admin/catalog', payload)
    ElMessage.success('目录项已添加')
  }
  catalogDialogVisible.value = false
  await fetchCatalog()
}

const deleteCatalogEntry = async (entry) => {
  try {
    await ElMessageBox.confirm(`停用目录项「${entry.value}」？历史工单数据不会被修改。`, '确认停用', {
      confirmButtonText: '停用',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  await api.delete(`/admin/catalog/${entry.id}`)
  ElMessage.success('目录项已停用')
  await fetchCatalog()
}

const reactivateCatalogEntry = async (entry) => {
  const response = await api.put(`/admin/catalog/${entry.id}/activate`)
  ElMessage.success(response.msg || '目录项已重新启用')
  await fetchCatalog()
}

const openFollowupDialog = (review) => {
  followupReview.value = review
  followupNote.value = review.adminFollowup || ''
  followupDialogVisible.value = true
}

const saveReviewFollowup = async () => {
  await api.put(`/order/reviews/${followupReview.value.id}/followup`, { note: followupNote.value })
  ElMessage.success('评价跟进记录已保存')
  followupDialogVisible.value = false
  await fetchReviews()
}

const uploadCompletionImage = async (upload) => {
  const formData = new FormData()
  formData.append('image', upload.file)
  try {
    const response = await api.post(`/order/${editForm.id}/completion-evidence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    completionImageUrl.value = response.data.completionImgUrl
    ElMessage.success('完工照片上传成功')
    upload.onSuccess(response.data)
  } catch (error) {
    upload.onError(error)
  }
}

const reopenOrder = async (order) => {
  await api.post(`/order/${order.id}/reopen`)
  ElMessage.success('工单已重新开启处理')
  await Promise.all([fetchOrders(), fetchOverview()])
}

const saveMaintenanceStaff = async () => {
  const name = staffForm.name.trim()
  const username = staffForm.username.trim()
  const needsPassword = staffForm.type === 'person' &&
    (!editingStaffId.value || (!staffHasAccount.value && Boolean(username)))
  if (!name) {
    ElMessage.warning('请输入维修人员或维修组名称')
    return
  }
  if (staffForm.type === 'person' &&
      ((!editingStaffId.value && !username) ||
       (needsPassword && !staffForm.password) ||
       (username && !/^[A-Za-z0-9._-]{3,64}$/.test(username)) ||
       (staffForm.password && (new TextEncoder().encode(staffForm.password).length < 8 ||
         new TextEncoder().encode(staffForm.password).length > 72)))) {
    ElMessage.warning('维修人员账号须为3至64位英文、数字、点、下划线或连字符；初始密码须为8至72字节')
    return
  }

  staffSaving.value = true
  try {
    const payload = {
      ...staffForm,
      name,
      phone: staffForm.phone.trim(),
      description: staffForm.description.trim(),
      username: staffForm.type === 'person' ? staffForm.username.trim() : '',
      password: staffForm.type === 'person' ? staffForm.password : ''
    }
    if (editingStaffId.value) {
      await api.put(`/maintenance-staff/${editingStaffId.value}`, payload)
      ElMessage.success('维修人员信息已更新')
    } else {
      await api.post('/maintenance-staff', payload)
      ElMessage.success('维修人员已添加')
    }
    staffDialogVisible.value = false
    await fetchMaintenanceStaff()
  } finally {
    staffSaving.value = false
  }
}

const deleteMaintenanceStaff = async (staff) => {
  try {
    await ElMessageBox.confirm(
      `确定删除「${staff.name}」吗？已分派工单中保存的负责人记录不会被修改。`,
      '删除维修人员',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  await api.delete(`/maintenance-staff/${staff.id}`)
  ElMessage.success('维修人员已删除')
  await fetchMaintenanceStaff()
}

const handleFilter = () => {
  page.value = 1
  fetchOrders()
}

const handleSearch = () => {
  page.value = 1
  fetchOrders()
}

const handleRefresh = () => viewPage.value === 1
  ? fetchOverview()
  : viewPage.value === 2
    ? Promise.all([fetchOrders(), fetchStats()])
    : viewPage.value === 3
      ? fetchMaintenanceStaff()
      : viewPage.value === 4
        ? fetchReviews()
        : viewPage.value === 5
          ? fetchCatalog()
          : fetchAuditLogs()

const handleReviewsPageChange = (nextPage) => {
  reviewsPage.value = nextPage
  fetchReviews()
}

const handleReviewsSearch = () => {
  reviewsPage.value = 1
  fetchReviews()
}

const handleAuditSearch = () => {
  auditPage.value = 1
  fetchAuditLogs()
}

const handleReviewsSizeChange = (nextSize) => {
  reviewsSize.value = nextSize
  reviewsPage.value = 1
  fetchReviews()
}

const handleAuditSizeChange = (nextSize) => {
  auditSize.value = nextSize
  auditPage.value = 1
  fetchAuditLogs()
}

const handlePageChange = (nextPage) => {
  page.value = nextPage
  fetchOrders()
}

const handleSizeChange = (nextSize) => {
  size.value = nextSize
  page.value = 1
  fetchOrders()
}

// 工单详情使用后端现有 GET /order/:id 接口。
const fetchOrderDetail = async (id) => {
  const response = await api.get(`/order/${id}`)
  return response.data
}

const openDetail = async (order) => {
  detailLoading.value = true
  detailVisible.value = true
  detailOrder.value = null
  detailMessages.value = []
  try {
    detailOrder.value = await fetchOrderDetail(order.id)
    const messagesResponse = await api.get(`/order/${order.id}/messages`)
    detailMessages.value = Array.isArray(messagesResponse.data) ? messagesResponse.data : []
    replyMessage.value = ''
  } catch (error) {
    if (!detailOrder.value) detailVisible.value = false
    else ElMessage.error(error.message || '沟通记录加载失败')
  } finally {
    detailLoading.value = false
  }
}

const sendReply = async () => {
  const content = replyMessage.value.trim()
  if (!detailOrder.value || !content || sendingReply.value) return
  sendingReply.value = true
  try {
    await api.post(`/order/${detailOrder.value.id}/messages`, { content })
    replyMessage.value = ''
    const response = await api.get(`/order/${detailOrder.value.id}/messages`)
    detailMessages.value = Array.isArray(response.data) ? response.data : []
    ElMessage.success('回复已发送')
  } finally {
    sendingReply.value = false
  }
}

const reanalyzeOrder = async () => {
  if (!detailOrder.value || aiAnalyzingOrderId.value) return
  try {
    await ElMessageBox.confirm(
      '将根据故障描述重新生成 AI 分类和安全建议，并替换当前工单中的 AI 结果。是否继续？',
      '重新分析工单',
      { confirmButtonText: '重新分析', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  const orderId = detailOrder.value.id
  aiAnalyzingOrderId.value = orderId
  try {
    const response = await api.post(`/admin/order/${orderId}/ai-analysis`)
    Object.assign(detailOrder.value, response.data)
    ElMessage.success('工单 AI 分析已更新')
    await fetchOrders()
  } finally {
    aiAnalyzingOrderId.value = null
  }
}

const openEdit = async (order) => {
  if (isCompletedOrder(order.status)) return

  saving.value = true
  try {
    const [detail] = await Promise.all([
      fetchOrderDetail(order.id),
      fetchMaintenanceStaff()
    ])
    if (isCompletedOrder(detail.status)) {
      ElMessage.info('已完成工单不可编辑')
      return
    }
    Object.assign(editForm, {
      id: detail.id,
      title: detail.title,
      status: statusApiValue(detail.status) || 'pending',
      adminRemark: detail.adminRemark || '',
      assignedTo: detail.assignedTo || '',
      assignedStaffId: detail.assignedStaffId || null,
      completionNote: detail.completionNote || ''
    })
    completionImageUrl.value = detail.completionImgUrl || ''
    editVisible.value = true
  } finally {
    saving.value = false
  }
}

const submitEdit = async () => {
  if (!editForm.id) return
  saving.value = true
  try {
    // 现有接口仅支持更新状态和管理员备注，不提交工单正文修改。
    const response = await api.put(`/order/${editForm.id}/status`, {
      status: editForm.status,
      adminRemark: editForm.adminRemark,
      assignedTo: editForm.assignedTo,
      assignedStaffId: editForm.assignedStaffId,
      completionNote: editForm.completionNote
    })
    ElMessage.success(response.msg || '工单状态更新成功')
    editVisible.value = false
    await Promise.all([fetchOrders(), fetchOverview()])
  } finally {
    saving.value = false
  }
}

const handleDelete = async (order) => {
  try {
    await ElMessageBox.confirm(
      `确定删除工单「${order.title}」吗？此操作会将工单软删除。`,
      '删除确认',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  deletingId.value = order.id
  try {
    const response = await api.delete(`/order/${order.id}`)
    ElMessage.success(response.msg || '工单删除成功')
    if (orders.value.length === 1 && page.value > 1) page.value -= 1
    await Promise.all([fetchOrders(), fetchStats()])
  } finally {
    deletingId.value = null
  }
}

const handleLogout = async () => {
  authStore.clearToken()
  await router.replace({ name: 'login' })
}

onMounted(() => {
  fetchOverview().catch((error) => {
    console.error('加载工单统计失败:', error)
  })
})
</script>

<template>
  <div class="admin-layout">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark small">报</div>
        <div>
          <strong>校园 AI 报修</strong>
          <span>管理后台</span>
        </div>
      </div>
      <el-button plain @click="handleLogout">退出登录</el-button>
    </header>

    <div class="admin-shell" :class="{ 'is-collapsed': sidebarCollapsed }">
      <aside class="admin-sidebar" aria-label="管理后台导航">
        <div class="sidebar-heading">
          <span v-if="!sidebarCollapsed">工作台</span>
          <el-button
            class="sidebar-toggle"
            text
            :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
            :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
            @click="toggleSidebar"
          >
            <el-icon>
              <Expand v-if="sidebarCollapsed" />
              <Fold v-else />
            </el-icon>
          </el-button>
        </div>
        <nav class="sidebar-nav">
          <button
            type="button"
            class="sidebar-nav-item"
            :class="{ active: viewPage === 1 }"
            :aria-current="viewPage === 1 ? 'page' : undefined"
            :title="sidebarCollapsed ? '工单统计' : undefined"
            @click="handleViewPageChange(1)"
          >
            <el-icon><DataAnalysis /></el-icon>
            <span v-if="!sidebarCollapsed">工单统计</span>
          </button>
          <button
            type="button"
            class="sidebar-nav-item"
            :class="{ active: viewPage === 2 }"
            :aria-current="viewPage === 2 ? 'page' : undefined"
            :title="sidebarCollapsed ? '工单列表' : undefined"
            @click="handleViewPageChange(2)"
          >
            <el-icon><Tickets /></el-icon>
            <span v-if="!sidebarCollapsed">工单列表</span>
          </button>
          <button
            type="button"
            class="sidebar-nav-item"
            :class="{ active: viewPage === 3 }"
            :aria-current="viewPage === 3 ? 'page' : undefined"
            :title="sidebarCollapsed ? '维修人/维修组' : undefined"
            @click="handleViewPageChange(3)"
          >
            <el-icon><Edit /></el-icon>
            <span v-if="!sidebarCollapsed">维修人/维修组</span>
          </button>
          <button
            type="button"
            class="sidebar-nav-item"
            :class="{ active: viewPage === 4 }"
            :aria-current="viewPage === 4 ? 'page' : undefined"
            :title="sidebarCollapsed ? '用户评价' : undefined"
            @click="handleViewPageChange(4)"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span v-if="!sidebarCollapsed">用户评价</span>
          </button>
          <button
            type="button"
            class="sidebar-nav-item"
            :class="{ active: viewPage === 5 }"
            :aria-current="viewPage === 5 ? 'page' : undefined"
            :title="sidebarCollapsed ? '目录设置' : undefined"
            @click="handleViewPageChange(5)"
          >
            <el-icon><Setting /></el-icon>
            <span v-if="!sidebarCollapsed">目录设置</span>
          </button>
          <button
            type="button"
            class="sidebar-nav-item"
            :class="{ active: viewPage === 6 }"
            :aria-current="viewPage === 6 ? 'page' : undefined"
            :title="sidebarCollapsed ? '操作记录' : undefined"
            @click="handleViewPageChange(6)"
          >
            <el-icon><Files /></el-icon>
            <span v-if="!sidebarCollapsed">操作记录</span>
          </button>
        </nav>
      </aside>

      <main class="content">
      <section class="page-title-row">
        <div>
          <p class="eyebrow">
            {{ viewPage === 1
              ? 'CAMPUS REPAIR OVERVIEW'
              : viewPage === 2
                ? 'ORDER MANAGEMENT'
                : viewPage === 3
                  ? 'MAINTENANCE DIRECTORY'
                  : viewPage === 4
                    ? 'STUDENT FEEDBACK'
                    : viewPage === 5
                      ? 'REPAIR CATALOG'
                      : 'ADMIN AUDIT LOG' }}
          </p>
          <h1>
            {{ viewPage === 1
              ? '工单统计'
              : viewPage === 2
                ? '工单列表'
                : viewPage === 3
                  ? '维修人 / 维修组管理'
                  : viewPage === 4
                    ? '用户评价'
                    : viewPage === 5
                      ? '报修目录设置'
                      : '管理员操作记录' }}
          </h1>
          <p class="page-description">
            {{ viewPage === 1
              ? '掌握校园报修整体情况与处理进度'
              : viewPage === 2
                ? '查看工单详情、筛选记录并处理报修进度'
                : viewPage === 3
                  ? '维护维修人员与维修组资料，便于工单分派'
                  : viewPage === 4
                    ? '查看用户对已完成维修工单的服务评价'
                    : viewPage === 5
                      ? '维护小程序可选的故障类型和报修楼栋'
                      : '查看管理员对工单及系统目录的操作历史' }}
          </p>
        </div>
        <div class="hero-note">
          <span class="hero-leaf">✿</span>
          <div>
            <strong>用心响应每一份报修</strong>
            <span>让校园生活更安心</span>
          </div>
        </div>
      </section>

      <template v-if="viewPage === 1">
        <section v-if="stats" v-loading="statsLoading" class="stats-grid">
          <article class="stat-card stat-total">
            <span class="stat-icon">单</span>
            <div><span>有效工单</span><strong>{{ stats.total }}</strong></div>
          </article>
          <article class="stat-card stat-pending">
            <span class="stat-icon">待</span>
            <div><span>待处理</span><strong>{{ stats.statusCounts['待处理'] || 0 }}</strong></div>
          </article>
          <article class="stat-card stat-processing">
            <span class="stat-icon">修</span>
            <div><span>维修中</span><strong>{{ stats.statusCounts['处理中'] || 0 }}</strong></div>
          </article>
          <article class="stat-card stat-finished">
            <span class="stat-icon">✓</span>
            <div><span>已完成</span><strong>{{ stats.statusCounts['已完成'] || 0 }}</strong></div>
          </article>
          <article class="stat-card stat-time">
            <span class="stat-icon">时</span>
            <div><span>平均处理时长</span><strong>{{ stats.averageResolutionHours === null ? '—' : `${stats.averageResolutionHours} 小时` }}</strong></div>
          </article>
        </section>

        <section v-if="stats" class="stats-breakdown">
          <article class="breakdown-card">
            <div class="breakdown-heading">
              <strong>故障类型分布</strong>
              <span>按工单分类</span>
            </div>
            <div v-if="stats.categories.length" class="breakdown-list">
              <div v-for="item in stats.categories" :key="item.category" class="breakdown-row">
                <span>{{ item.category }}</span>
                <strong>{{ item.count }}</strong>
              </div>
            </div>
            <p v-else class="breakdown-empty">暂无分类数据</p>
          </article>
          <article class="breakdown-card">
            <div class="breakdown-heading">
              <strong>报修地点分布</strong>
              <span>按楼栋统计</span>
            </div>
            <div v-if="stats.locations.length" class="breakdown-list">
              <div v-for="item in stats.locations" :key="item.building" class="breakdown-row">
                <span>{{ item.building }}</span>
                <strong>{{ item.count }}</strong>
              </div>
            </div>
            <p v-else class="breakdown-empty">暂无地点数据</p>
          </article>
        </section>

        <el-card class="table-card ai-insights-card" shadow="never" v-loading="aiInsightsLoading">
          <div class="toolbar">
            <div class="toolbar-title">
              <strong>AI 工单分析</strong>
              <span>{{ aiInsights?.generatedAt ? `更新于 ${formatDate(aiInsights.generatedAt)}` : '基于工单历史统计' }}</span>
            </div>
            <el-button :loading="aiInsightsLoading" @click="fetchAiInsights">
              <el-icon><Refresh /></el-icon>重新分析
            </el-button>
          </div>
          <template v-if="aiInsights">
            <p v-if="aiInsights.available" class="ai-insights-summary">{{ aiInsights.summary }}</p>
            <el-alert
              v-else
              title="AI 文本分析暂不可用；下方工单统计仍可正常查看。请检查后端 DEEPSEEK_API_KEY 配置或稍后重试。"
              type="info"
              :closable="false"
              show-icon
            />
            <div class="ai-insights-content">
              <section>
                <strong>近六个月工单趋势</strong>
                <div class="ai-month-list">
                  <div v-for="item in aiInsights.metrics.monthlyCounts" :key="item.month" class="ai-month-row">
                    <span>{{ item.month }}</span>
                    <div class="ai-month-track"><i :style="{ width: `${Math.min(100, item.count / Math.max(1, ...aiInsights.metrics.monthlyCounts.map((month) => month.count)) * 100)}%` }"></i></div>
                    <b>{{ item.count }}</b>
                  </div>
                </div>
              </section>
              <section v-if="aiInsights.available">
                <strong>观察与建议</strong>
                <ul class="ai-insights-list">
                  <li v-for="(item, index) in aiInsights.observations" :key="`observation-${index}`">{{ item }}</li>
                  <li v-for="(item, index) in aiInsights.recommendations" :key="`recommendation-${index}`">{{ item }}</li>
                </ul>
              </section>
            </div>
            <p class="ai-insights-footnote">AI 结论基于匿名汇总数据，仅供管理参考；不会向 AI 服务发送报修人姓名、电话或工单描述。</p>
          </template>
        </el-card>

        <section class="admin-insight-grid">
          <el-card class="table-card insight-card" shadow="never">
            <div class="toolbar">
              <div class="toolbar-title">
                <strong>处理时限预警</strong>
                <span>逾期 {{ slaAlerts.filter((item) => item.overdue).length }} 单</span>
              </div>
              <el-button plain @click="slaSettingsVisible = true">
                <el-icon><Setting /></el-icon>
                设置时限
              </el-button>
            </div>
            <el-table :data="slaAlerts" class="orders-table" empty-text="当前没有临近或逾期工单">
              <el-table-column prop="title" label="工单" min-width="150" show-overflow-tooltip />
              <el-table-column prop="status" label="状态" width="100" />
              <el-table-column prop="assignedTo" label="负责人" min-width="120">
                <template #default="{ row }">{{ row.assignedTo || '未分派' }}</template>
              </el-table-column>
              <el-table-column prop="username" label="工作台账号" min-width="150">
                <template #default="{ row }">{{ row.username || '未开通' }}</template>
              </el-table-column>
              <el-table-column label="处理时长 / 时限" min-width="160">
                <template #default="{ row }">{{ row.elapsedHours }} / {{ row.limitHours }} 小时</template>
              </el-table-column>
              <el-table-column label="预警" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.overdue ? 'danger' : 'warning'">
                    {{ row.overdue ? '已逾期' : '即将逾期' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="升级处理" width="120">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openEdit(row)">立即处理</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card class="table-card insight-card" shadow="never">
            <div class="toolbar">
              <div class="toolbar-title">
                <strong>维修工作量</strong>
                <span>未分派 {{ workload.unassignedCount }} 单 · 按当前负载推荐人员</span>
              </div>
            </div>
            <el-table :data="workload.staff" class="orders-table" empty-text="暂无维修人员或维修组">
              <el-table-column prop="name" label="人员 / 维修组" min-width="140" />
              <el-table-column prop="total" label="总数" width="70" />
              <el-table-column prop="pending" label="待处理" width="85" />
              <el-table-column prop="processing" label="维修中" width="85" />
              <el-table-column prop="finished" label="已完成" width="85" />
              <el-table-column label="平均完成时长" min-width="120">
                <template #default="{ row }">
                  {{ row.averageResolutionHours === null ? '—' : `${row.averageResolutionHours} 小时` }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </section>

        <el-empty v-if="!stats && !statsLoading" description="暂时无法加载统计数据" />
      </template>

      <el-card v-else-if="viewPage === 2" class="table-card" shadow="never">
        <div class="toolbar">
          <div class="toolbar-title">
            <strong>全部工单</strong>
            <span>共 {{ total }} 条记录</span>
          </div>
          <div class="filter-controls">
            <el-button :loading="exportLoading" @click="exportOrders">
              <el-icon><Download /></el-icon>
              导出 CSV
            </el-button>
            <el-input
              v-model="searchKeyword"
              clearable
              placeholder="搜索标题、描述、地点、报修人或电话"
              class="search-input"
              @keyup.enter="handleSearch"
              @clear="handleSearch"
            >
              <template #append>
                <el-button :loading="loading" @click="handleSearch">
                  <el-icon><Search /></el-icon>
                  搜索
                </el-button>
              </template>
            </el-input>
            <el-select
              v-model="statusFilter"
              clearable
              placeholder="全部状态"
              class="status-filter"
              @change="handleFilter"
            >
              <el-option
                v-for="item in statusOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-select
              v-model="categoryFilter"
              clearable
              placeholder="全部类型"
              class="status-filter"
              @change="handleFilter"
            >
              <el-option
                v-for="category in categoryOptions"
                :key="category"
                :label="category"
                :value="category"
              />
            </el-select>
            <el-input
              v-model="locationFilter"
              clearable
              placeholder="楼栋/房间"
              class="location-filter"
              @keyup.enter="handleFilter"
              @clear="handleFilter"
            />
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              class="date-filter"
              @change="handleFilter"
            />
            <el-select v-model="sortFilter" class="sort-filter" @change="handleFilter">
              <el-option label="最新提交" value="newest" />
              <el-option label="最早提交" value="oldest" />
              <el-option label="等待最久" value="waiting" />
            </el-select>
            <el-button :loading="loading" @click="handleRefresh">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>

        <el-table
          v-loading="loading"
          :data="orders"
          row-key="id"
          stripe
          class="orders-table"
          empty-text="暂无工单数据"
        >
          <el-table-column prop="id" label="编号" width="88" />
          <el-table-column prop="title" label="工单标题" min-width="160" show-overflow-tooltip />
          <el-table-column prop="location" label="报修地点" min-width="150" show-overflow-tooltip />
          <el-table-column prop="assignedTo" label="维修负责人" min-width="130">
            <template #default="{ row }">{{ row.assignedTo || '未分派' }}</template>
          </el-table-column>
          <el-table-column prop="desc" label="故障描述" min-width="220" show-overflow-tooltip />
          <el-table-column label="报修人" min-width="130">
            <template #default="{ row }">
              {{ row.user?.nickname || `用户 #${row.userId}` }}
            </template>

          </el-table-column>
          <el-table-column label="联系电话" min-width="130">
            <template #default="{ row }">
              {{ row.phone || row.user?.phone || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="150">
            <template #default="{ row }">
              <div class="status-cell">
                <el-tag :type="statusType(row.status)" effect="light" round>
                  {{ statusLabel(row.status) }}
                </el-tag>
                <el-tag
                  v-if="row.deletedBy === 'student' && row.status !== '已完成' && row.status !== 'finished'"
                  type="info"
                  effect="plain"
                  round
                >
                  用户端已删除
                </el-tag>
              </div>
            </template>

          </el-table-column>
          <el-table-column label="提交时间" min-width="175">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="185" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="info" @click="openDetail(row)">
                  <el-icon><View /></el-icon>
                  详情
                </el-button>
                <el-button
                  v-if="row.deletedBy !== 'student' && !isCompletedOrder(row.status)"
                  link
                  type="primary"
                  :loading="saving"
                  @click="openEdit(row)"
                >
                  编辑状态
                </el-button>
                <el-button
                  v-if="isCompletedOrder(row.status)"
                  link
                  type="danger"
                  :loading="deletingId === row.id"
                  @click="handleDelete(row)"
                >
                  删除
                </el-button>
                <el-button
                  v-if="row.reopenRequestedAt"
                  link
                  type="warning"
                  @click="reopenOrder(row)"
                >
                  重新处理
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-row">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="size"
            :page-sizes="[10, 20, 50]"
            :total="total"
            background
            layout="total, sizes, prev, pager, next, jumper"
            @current-change="handlePageChange"
            @size-change="handleSizeChange"
          />
        </div>
      </el-card>

      <el-card v-else-if="viewPage === 3" class="table-card staff-card" shadow="never">
        <div class="staff-toolbar">
          <div class="toolbar-title">
            <strong>维修人员与维修组</strong>
            <span>
              {{ staffSearchKeyword.trim()
                ? `匹配 ${filteredMaintenanceStaff.length} / ${maintenanceStaff.length} 条`
                : `共 ${maintenanceStaff.length} 条记录` }}
            </span>
          </div>
          <div class="staff-toolbar-actions">
            <el-input
              v-model="staffSearchKeyword"
              clearable
              class="staff-search"
              placeholder="搜索名称、电话、备注或类型"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="primary" @click="openStaffDialog()">
              <el-icon><Plus /></el-icon>
              添加人员 / 维修组
            </el-button>
          </div>
        </div>
        <el-table
          v-loading="staffLoading"
          :data="filteredMaintenanceStaff"
          row-key="id"
          stripe
          class="orders-table"
          :empty-text="staffSearchKeyword.trim()
            ? '没有找到匹配的维修人员或维修组'
            : '暂无维修人员或维修组，请先添加'"
        >
          <el-table-column prop="name" label="名称" min-width="180" />
          <el-table-column label="类型" width="150">
            <template #default="{ row }">
              <el-tag :type="row.type === 'team' ? 'success' : 'primary'" effect="light" round>
                {{ row.type === 'team' ? '维修组' : '维修人员' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="联系电话" min-width="160">
            <template #default="{ row }">{{ row.phone || '—' }}</template>
          </el-table-column>
          <el-table-column prop="description" label="备注" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="180">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="primary" @click="openStaffDialog(row)">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-button>
                <el-button link type="danger" @click="deleteMaintenanceStaff(row)">
                  <el-icon><Delete /></el-icon>
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card v-else-if="viewPage === 4" class="table-card reviews-card" shadow="never">
        <div class="toolbar">
          <div class="toolbar-title">
            <strong>已完成工单评价</strong>
            <span>共 {{ reviewsTotal }} 条评价</span>
          </div>
          <el-input
            v-model="reviewsSearchKeyword"
            clearable
            class="page-search"
            placeholder="搜索评价、工单、地点或用户"
            @keyup.enter="handleReviewsSearch"
            @clear="handleReviewsSearch"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
            <template #append><el-button @click="handleReviewsSearch">搜索</el-button></template>
          </el-input>
          <div class="review-summary">
            <el-tag type="success">平均评分 {{ reviewsAverage.toFixed(1) }}</el-tag>
            <el-tag type="danger">低分评价 {{ reviewsLowCount }}</el-tag>
          </div>
          <el-button :loading="reviewsLoading" @click="fetchReviews">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
        <el-table
          v-loading="reviewsLoading"
          :data="reviews"
          row-key="id"
          stripe
          class="orders-table"
          empty-text="暂无用户评价"
        >
          <el-table-column label="评分" width="190">
            <template #default="{ row }">
              <el-rate :model-value="row.rating" disabled show-score />
            </template>
          </el-table-column>
          <el-table-column label="评价内容" min-width="260">
            <template #default="{ row }">
              <span class="review-comment">{{ row.comment || '用户未填写文字评价' }}</span>
              <el-tag v-if="row.rating <= 2" class="low-rating-tag" type="danger" size="small">需跟进</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="评价方面" width="120">
            <template #default="{ row }">{{ feedbackTypeLabel(row.feedbackType) }}</template>
          </el-table-column>
          <el-table-column label="关联工单" min-width="200">
            <template #default="{ row }">
              <span>{{ row.order?.title || `工单 #${row.orderId}` }}</span>
            </template>
          </el-table-column>
          <el-table-column label="报修地点" min-width="160">
            <template #default="{ row }">{{ row.order?.location || '—' }}</template>
          </el-table-column>
          <el-table-column label="评价用户" min-width="150">
            <template #default="{ row }">
              {{ row.user?.nickname || `用户 #${row.userId}` }}
            </template>
          </el-table-column>
          <el-table-column label="评价时间" min-width="180">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="管理员跟进" min-width="210">
            <template #default="{ row }">
              <div class="followup-cell">
                <span>{{ row.adminFollowup || '尚未跟进' }}</span>
                <el-button link type="primary" @click="openFollowupDialog(row)">
                  {{ row.adminFollowup ? '编辑记录' : '添加记录' }}
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-row">
          <el-pagination
            v-model:current-page="reviewsPage"
            v-model:page-size="reviewsSize"
            :page-sizes="[10, 20, 50]"
            :total="reviewsTotal"
            background
            layout="total, sizes, prev, pager, next, jumper"
            @current-change="handleReviewsPageChange"
            @size-change="handleReviewsSizeChange"
          />
        </div>
      </el-card>

      <el-card v-else-if="viewPage === 5" class="table-card catalog-card" shadow="never">
        <div class="staff-toolbar">
          <div class="toolbar-title">
            <strong>故障类型与报修楼栋</strong>
            <span>
              {{ catalogSearchKeyword.trim()
                ? `匹配 ${filteredCatalogEntries.length} / ${catalogEntries.length} 项`
                : `共 ${catalogEntries.length} 项` }}
            </span>
          </div>
          <div class="staff-toolbar-actions">
            <el-input
              v-model="catalogSearchKeyword"
              clearable
              class="staff-search"
              placeholder="搜索目录名称、类别或状态"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <div class="staff-toolbar-actions">
              <el-button @click="openLocationQrDialog">生成地点二维码</el-button>
              <el-button type="primary" @click="openCatalogDialog()">
                <el-icon><Plus /></el-icon>
                添加目录项
              </el-button>
            </div>
          </div>
        </div>
        <el-table
          v-loading="catalogsLoading"
          :data="filteredCatalogEntries"
          row-key="id"
          stripe
          class="orders-table"
          :empty-text="catalogSearchKeyword.trim() ? '没有找到匹配的目录项' : '暂无目录项'"
        >
          <el-table-column label="类别" width="160">
            <template #default="{ row }">{{ row.type === 'category' ? '故障类型' : '报修楼栋' }}</template>
          </el-table-column>
          <el-table-column prop="value" label="名称" min-width="220" />
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="row.active ? 'success' : 'info'">{{ row.active ? '启用' : '已停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="primary" @click="openCatalogDialog(row)">
                  <el-icon><Edit /></el-icon>编辑
                </el-button>
                <el-button
                  v-if="!row.active"
                  link
                  type="success"
                  @click="reactivateCatalogEntry(row)"
                >重新启用</el-button>
                <el-button v-if="row.active" link type="danger" @click="deleteCatalogEntry(row)">
                  <el-icon><Delete /></el-icon>停用
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card v-else class="table-card audit-card" shadow="never">
        <div class="toolbar">
          <div class="toolbar-title">
            <strong>管理员操作审计</strong>
            <span>共 {{ auditTotal }} 条记录</span>
          </div>
          <el-input
            v-model="auditSearchKeyword"
            clearable
            class="page-search"
            placeholder="搜索操作、目标、详情或管理员"
            @keyup.enter="handleAuditSearch"
            @clear="handleAuditSearch"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
            <template #append><el-button @click="handleAuditSearch">搜索</el-button></template>
          </el-input>
          <el-button :loading="auditLoading" @click="fetchAuditLogs">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
        <el-table :data="auditLogs" v-loading="auditLoading" class="orders-table" empty-text="暂无管理员操作记录">
          <el-table-column label="操作人" min-width="150">
            <template #default="{ row }">{{ row.admin?.name || row.admin?.username || `管理员 #${row.adminId}` }}</template>
          </el-table-column>
          <el-table-column label="操作" min-width="180">
            <template #default="{ row }">{{ auditActionLabels[row.action] || row.action }}</template>
          </el-table-column>
          <el-table-column label="目标" min-width="190">
            <template #default="{ row }">{{ formatAuditTarget(row) }}</template>
          </el-table-column>
          <el-table-column label="操作详情" min-width="360" show-overflow-tooltip>
            <template #default="{ row }">{{ formatAuditDetails(row.details) }}</template>
          </el-table-column>
          <el-table-column label="时间" min-width="180">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-row">
          <el-pagination
            v-model:current-page="auditPage"
            v-model:page-size="auditSize"
            :page-sizes="[10, 20, 50]"
            :total="auditTotal"
            background
            layout="total, sizes, prev, pager, next, jumper"
            @current-change="fetchAuditLogs"
            @size-change="handleAuditSizeChange"
          />
        </div>
      </el-card>

      <el-dialog v-model="slaSettingsVisible" title="工单处理时限设置" width="440px">
        <el-form label-position="top">
          <el-form-item label="待处理工单时限（小时）">
            <el-input-number v-model="slaSettings.pendingHours" :min="1" :max="720" />
          </el-form-item>
          <el-form-item label="维修中工单时限（小时）">
            <el-input-number v-model="slaSettings.processingHours" :min="1" :max="720" />
          </el-form-item>
          <p class="form-hint">达到时限的 80% 时标记为即将逾期，超过时限则标记为逾期。</p>
        </el-form>
        <template #footer>
          <el-button @click="slaSettingsVisible = false">取消</el-button>
          <el-button type="primary" :loading="slaSaving" @click="saveSlaSettings">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="catalogDialogVisible" :title="catalogForm.id ? '编辑目录项' : '添加目录项'" width="460px">
        <el-form label-position="top">
          <el-form-item label="目录类别">
            <el-select v-model="catalogForm.type" class="full-width">
              <el-option label="故障类型" value="category" />
              <el-option label="报修楼栋" value="building" />
            </el-select>
          </el-form-item>
          <el-form-item label="名称" required>
            <el-input v-model="catalogForm.value" maxlength="100" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="catalogDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveCatalogEntry">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="locationQrVisible" title="生成报修地点二维码" width="460px">
        <el-form label-position="top">
          <el-form-item label="楼栋" required>
            <el-select
              v-model="locationQrForm.building"
              class="full-width"
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入楼栋"
            >
              <el-option
                v-for="entry in catalogEntries.filter((item) => item.type === 'building' && item.active)"
                :key="entry.id"
                :label="entry.value"
                :value="entry.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="楼层（选填）">
            <el-input v-model="locationQrForm.floor" maxlength="40" placeholder="例如：3" />
          </el-form-item>
          <el-form-item label="房间 / 具体位置（选填）">
            <el-input v-model="locationQrForm.room" maxlength="80" placeholder="例如：305" />
          </el-form-item>
        </el-form>
        <div v-if="locationQrDataUrl" class="location-qr-preview">
          <img :src="locationQrDataUrl" alt="报修地点二维码" />
          <span>{{ [locationQrForm.building, locationQrForm.floor && `${locationQrForm.floor}层`, locationQrForm.room].filter(Boolean).join(' ') }}</span>
          <a :href="locationQrDataUrl" download="campus-repair-location.png">下载二维码图片</a>
        </div>
        <template #footer>
          <el-button @click="locationQrVisible = false">关闭</el-button>
          <el-button type="primary" :loading="locationQrLoading" @click="generateLocationQr">生成二维码</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="followupDialogVisible" title="评价跟进记录" width="520px">
        <el-input
          v-model="followupNote"
          type="textarea"
          :rows="5"
          maxlength="1000"
          show-word-limit
          placeholder="记录联系用户、复查情况或整改措施"
        />
        <template #footer>
          <el-button @click="followupDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveReviewFollowup">保存记录</el-button>
        </template>
      </el-dialog>

      <el-dialog
        v-model="staffDialogVisible"
        :title="editingStaffId ? '编辑维修人员 / 维修组' : '添加维修人员 / 维修组'"
        width="520px"
        destroy-on-close
      >
        <el-form label-position="top">
          <el-form-item label="名称" required>
            <el-input v-model="staffForm.name" maxlength="100" placeholder="输入人员姓名或维修组名称" />
          </el-form-item>
          <el-form-item label="类型" required>
            <el-radio-group v-model="staffForm.type">
              <el-radio value="person">维修人员</el-radio>
              <el-radio value="team">维修组</el-radio>
            </el-radio-group>
          </el-form-item>
          <template v-if="staffForm.type === 'person'">
            <el-form-item label="工作台账号" :required="!editingStaffId">
              <el-input
                v-model="staffForm.username"
                maxlength="64"
                autocomplete="off"
                placeholder="3至64位英文、数字、点、下划线或连字符"
              />
            </el-form-item>
            <el-form-item
              :label="staffHasAccount
                ? '重置工作台密码（选填）'
                : editingStaffId
                  ? '新建工作台密码（填写账号时必填）'
                  : '初始工作台密码'"
              :required="!editingStaffId || (!staffHasAccount && !!staffForm.username.trim())"
            >
              <el-input
                v-model="staffForm.password"
                type="password"
                show-password
                maxlength="72"
                autocomplete="new-password"
                :placeholder="staffHasAccount ? '留空表示不修改；8至72字节' : '创建账号时必填，8至72字节'"
              />
            </el-form-item>
          </template>
          <el-form-item label="联系电话">
            <el-input v-model="staffForm.phone" maxlength="30" placeholder="选填" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="staffForm.description"
              type="textarea"
              :rows="3"
              maxlength="500"
              show-word-limit
              placeholder="选填"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="staffDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="staffSaving" @click="saveMaintenanceStaff">保存</el-button>
        </template>
      </el-dialog>

    <el-dialog v-model="editVisible" title="编辑工单状态" width="520px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="工单标题">
          <el-input :model-value="editForm.title" disabled />
        </el-form-item>
        <el-form-item label="处理状态" required>
          <el-select v-model="editForm.status" class="full-width">
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="维修负责人 / 维修组">
          <div class="assignment-controls">
            <el-select
              v-model="assigneeSelection"
              class="full-width"
              filterable
              allow-create
              clearable
              default-first-option
              placeholder="选择已登记人员或输入其他名称"
            >
              <el-option
                v-for="staff in maintenanceStaff"
                :key="staff.id"
                :label="`${staff.name}（${staff.type === 'team' ? '维修组' : '维修人员'}）`"
                :value="staff.id"
              />
            </el-select>
            <el-button @click="recommendAssignee">推荐负责人</el-button>
          </div>
          <p class="form-hint">推荐仅参考已开通工作台账号人员的待处理/维修中数量及历史平均完成时长，需管理员确认后保存。</p>
        </el-form-item>
        <el-form-item label="管理员备注">
          <el-input
            v-model="editForm.adminRemark"
            type="textarea"
            :rows="4"
            placeholder="填写处理说明（选填）"
          />
        </el-form-item>
        <el-form-item v-if="editForm.status === 'finished'" label="完工说明">
          <el-input
            v-model="editForm.completionNote"
            type="textarea"
            :rows="3"
            maxlength="2000"
            placeholder="填写维修处理结果"
          />
        </el-form-item>
        <el-form-item v-if="editForm.status === 'finished'" label="完工照片">
          <el-upload
            :show-file-list="false"
            accept="image/jpeg,image/png,image/webp"
            :http-request="uploadCompletionImage"
          >
            <el-button>
              <el-icon><Plus /></el-icon>
              上传完工照片
            </el-button>
          </el-upload>
          <el-image
            v-if="completionImageUrl"
            :src="completionImageUrl"
            :preview-src-list="[completionImageUrl]"
            fit="cover"
            class="completion-preview"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="工单详情" width="620px" destroy-on-close>
      <div v-loading="detailLoading">
        <div v-if="detailOrder" class="ai-reanalyze-toolbar">
          <span>可根据当前故障描述重新生成分类和安全自查建议。</span>
          <el-button
            type="primary"
            plain
            :loading="aiAnalyzingOrderId === detailOrder.id"
            @click="reanalyzeOrder"
          >AI 重新分析</el-button>
        </div>
        <el-descriptions v-if="detailOrder" :column="1" border>
          <el-descriptions-item label="工单编号">{{ detailOrder.id }}</el-descriptions-item>
          <el-descriptions-item label="工单标题">{{ detailOrder.title }}</el-descriptions-item>
          <el-descriptions-item label="报修地点">{{ detailOrder.location }}</el-descriptions-item>
          <el-descriptions-item label="地图定位">
            <div v-if="detailMapUrl" class="map-location-detail">
              <span>{{ detailOrder.mapAddress || '用户选择的地图位置' }}</span>
              <span class="map-coordinates">
                {{ Number(detailOrder.latitude).toFixed(6) }}, {{ Number(detailOrder.longitude).toFixed(6) }}
              </span>
              <a :href="detailMapUrl" target="_blank" rel="noopener noreferrer">在地图中查看</a>
            </div>
            <span v-else>{{ detailOrder.mapAddress || '用户未选择地图定位' }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="detailOrder.additionalDescription" label="地点补充说明">
            {{ detailOrder.additionalDescription }}
          </el-descriptions-item>
          <el-descriptions-item label="维修负责人">{{ detailOrder.assignedTo || '未分派' }}</el-descriptions-item>
          <el-descriptions-item label="故障描述">{{ detailOrder.desc }}</el-descriptions-item>
          <el-descriptions-item label="故障图片">
            <el-image
              v-if="detailOrder.imgUrl"
              :src="detailOrder.imgUrl"
              :preview-src-list="[detailOrder.imgUrl]"
              fit="contain"
              class="repair-image"
            />
            <span v-else>未上传图片</span>
          </el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="statusType(detailOrder.status)">
              {{ statusLabel(detailOrder.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="报修人">
            {{ detailOrder.user?.nickname || `用户 #${detailOrder.userId}` }}
          </el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ detailOrder.phone || detailOrder.user?.phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="AI 分类">{{ detailOrder.aiCategory || '—' }}</el-descriptions-item>
          <el-descriptions-item label="AI 建议">{{ detailOrder.aiSuggest || '—' }}</el-descriptions-item>
          <el-descriptions-item label="管理员备注">{{ detailOrder.adminRemark || '—' }}</el-descriptions-item>
          <el-descriptions-item label="完工说明">{{ detailOrder.completionNote || '—' }}</el-descriptions-item>
          <el-descriptions-item label="用户确认完成">{{ detailOrder.studentConfirmedAt ? formatDate(detailOrder.studentConfirmedAt) : '尚未确认' }}</el-descriptions-item>
          <el-descriptions-item label="重新处理申请">
            {{ detailOrder.reopenRequestedAt ? `${detailOrder.reopenReason || '申请重新处理'}（${formatDate(detailOrder.reopenRequestedAt)}）` : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="完工照片">
            <el-image
              v-if="detailOrder.completionImgUrl"
              :src="detailOrder.completionImgUrl"
              :preview-src-list="[detailOrder.completionImgUrl]"
              fit="contain"
              class="repair-image"
            />
            <span v-else>未上传</span>
          </el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatDate(detailOrder.createdAt) }}</el-descriptions-item>
        </el-descriptions>
        <section v-if="detailOrder?.history?.length" class="history-section">
          <h3>处理记录</h3>
          <el-timeline>
            <el-timeline-item
              v-for="event in detailOrder.history"
              :key="event.id"
              :timestamp="formatDate(event.createdAt)"
              placement="top"
              type="success"
            >
              <strong>{{ event.eventType === 'created' ? '工单已提交' : event.eventType === 'assignment' ? '维修任务已分派' : event.eventType === 'note' ? '维修备注更新' : `状态更新：${event.status || ''}` }}</strong>
              <p v-if="event.assignedTo" class="history-note">负责人：{{ event.assignedTo }}</p>
              <p v-if="event.remark" class="history-note">{{ formatUserFacingText(event.remark) }}</p>
            </el-timeline-item>
          </el-timeline>
        </section>
        <section class="review-section">
          <strong>工单补充沟通</strong>
          <div v-if="detailMessages.length" class="message-thread">
            <article v-for="message in detailMessages" :key="message.id" class="message-entry">
              <div class="message-meta">
                <strong>{{ message.actorRole === 'admin' ? '管理员' : '用户' }}</strong>
                <span>{{ formatDate(message.createdAt) }}</span>
              </div>
              <p>{{ message.content }}</p>
              <el-image
                v-if="message.imageUrl"
                :src="message.imageUrl"
                :preview-src-list="[message.imageUrl]"
                fit="contain"
                class="repair-image"
              />
            </article>
          </div>
          <el-empty v-else description="暂无沟通记录" :image-size="60" />
          <el-input
            v-model="replyMessage"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="回复用户补充的信息"
          />
          <el-button
            type="primary"
            :loading="sendingReply"
            :disabled="!replyMessage.trim()"
            @click="sendReply"
          >发送回复</el-button>
        </section>
        <section v-if="detailOrder?.review" class="review-section">
          <strong>用户评价</strong>
          <el-tag v-if="detailOrder.review.feedbackType" size="small">
            {{ feedbackTypeLabel(detailOrder.review.feedbackType) }}
          </el-tag>
          <el-rate :model-value="detailOrder.review.rating" disabled show-score />
          <p v-if="detailOrder.review.comment">{{ detailOrder.review.comment }}</p>
        </section>
      </div>
    </el-dialog>
      </main>
    </div>
  </div>
</template>

<style scoped>
.status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.repair-image {
  width: 220px;
  height: 160px;
  border-radius: 8px;
  border: 1px solid #e4ece7;
  background: linear-gradient(145deg, #f8fbf9, #f1f5f8);
  box-shadow: 0 8px 18px rgba(67, 112, 91, 0.07);
  object-fit: cover;
}

.message-thread {
  display: grid;
  gap: 12px;
  margin: 16px 0;
}

.message-entry {
  padding: 12px 14px;
  border: 1px solid #e6eee9;
  border-radius: 12px;
  background: linear-gradient(145deg, #fafcfb, #f4f7f8);
  box-shadow: 0 5px 12px rgba(67, 112, 91, 0.04);
}

.message-meta {
  display: flex;
  justify-content: space-between;
  color: #64806d;
  font-size: 12px;
}

.message-entry p {
  margin: 10px 0 0;
  white-space: pre-wrap;
}

.map-location-detail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.map-coordinates {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.message-thread {
  gap: 14px;
  margin: 18px 0;
}

.map-location-detail {
  padding: 12px 14px;
  border: 1px solid #e7efea;
  border-radius: 12px;
  background: linear-gradient(145deg, #f8fbf9, #f3f7f8);
}

.completion-preview {
  border: 1px solid #e6eee9;
  border-radius: 12px;
  box-shadow: 0 7px 16px rgba(67, 112, 91, 0.07);
  object-fit: cover;
}

.location-qr-preview {
  border: 1px solid #e2ebe5;
  border-radius: 16px;
  background: linear-gradient(145deg, #f9fbfa, #f2f7f4);
  box-shadow: 0 8px 20px rgba(67, 112, 91, 0.06);
}

.status-cell .el-tag {
  min-width: 68px;
  justify-content: center;
  border: 1px solid rgba(255,255,255,0.72);
  box-shadow: 0 4px 10px rgba(67,112,91,0.055);
}

.repair-image,
.completion-preview,
.location-qr-preview img {
  border: 1px solid #e4ece7;
  box-shadow: 0 8px 18px rgba(67,112,91,0.07);
}

.row-actions .el-button {
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.row-actions .el-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(67,112,91,0.10);
}
</style>
