# 校园 AI 报修系统 API 文档

基础地址：`http://localhost:3000/api`

除登录接口外，所有接口都需要在请求头中携带登录令牌：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

## 统一响应格式

```json
{
  "code": 200,
  "msg": "查询成功",
  "data": {}
}
```

`code` 与 HTTP 状态码对应。成功请求返回 `200`（创建工单返回 `201`）；常见错误包括 `400` 参数错误、`401` 未登录或令牌无效、`403` 无权限、`404` 资源不存在和 `500` 服务器错误。错误响应仍使用 `{ "code": 数字, "msg": "说明", "data": null }`。

## 工单状态

| API 值 | 含义 | 数据库存储值 |
| --- | --- | --- |
| `pending` | 待处理 | `待处理` |
| `processing` | 维修中 | `处理中` |
| `finished` | 已完成 | `已完成` |

列表筛选及状态更新使用 API 值。

撤销工单后，工单状态会设置为 `已撤销`；该状态仅用于展示，不属于管理员状态更新接口可设置的状态。

## 接口列表

### 登录

`POST /auth/login`

请求体：

```json
{
  "code": "wx.login 返回的一次性 code",
  "nickname": "测试用户",
  "phone": "13800138000"
}
```

`code` 必填，由服务端使用 `WX_APPID` 和 `WX_APP_SECRET` 调用微信登录凭证校验接口换取 `openid`；`nickname`、`phone` 可选。联系电话用于更新用户资料。成功响应的 `data` 包含 `token` 和 `user`。不要将小程序 `appSecret` 放入客户端。

### 管理员账户初始化与登录

管理员登录使用 `POST /auth/adminlogin`，请求体为 `username` 和 `password`。管理员凭证保存在 `admin_users` 表中，密码使用 bcrypt 校验；旧的固定演示账号不再有效。

首次创建管理员，请在 `backend` 目录运行：

```powershell
node .\scripts\create-admin.js campus-admin "校园维修管理员"
```

脚本会在终端中隐藏输入并二次确认密码，要求密码长度为 12 至 72 字节。管理员密码不会作为明文写入数据库。JWT 使用 `.env` 中至少 32 字节的 `JWT_SECRET`；缺失或过短时后端拒绝启动。请使用随机生成的高熵密钥，并安全保管。

忘记已有管理员密码时，在 `backend` 目录打开交互式终端并运行以下命令；脚本会隐藏并二次确认新密码，仅重置指定账号：

```powershell
npm run reset-admin-password -- campus-admin
```

新密码必须为 12 至 72 字节。请勿将密码写入命令行参数或源码。

### 创建报修工单

`POST /order/create`（需要登录）

请求体：

```json
{
  "title": "宿舍灯损坏",
  "desc": "宿舍照明灯无法点亮",
  "location": "1号楼 201 室",
  "building": "1号楼",
  "floor": "2",
  "room": "201室",
  "phone": "13800138000",
  "category": "水电故障",
  "imgUrl": "https://example.com/repair.jpg"
}
```

`title`、`desc`、`location` 必填，`building`、`floor`、`room` 是可选的结构化地点信息。`phone` 为本次报修填写的联系电话，只保存到工单，不会修改用户个人资料；为空或格式无效时按接口校验规则处理。`mapAddress`、`latitude`、`longitude` 为可选的地图地点和坐标，坐标必须成对提供且位于有效经纬度范围内；`additionalDescription` 为不超过 1000 字的地点/故障补充信息。`category` 可选；配置了报修目录后，只接受已启用的故障类型。目录尚未初始化时使用内置故障类型作为兼容默认值；未提供时使用 AI 分类，AI 仍会生成自查建议。用户端通过 `GET /catalog` 加载故障类型及楼栋建议。图片可选：小程序通过 `multipart/form-data` 上传字段 `image`，仅接受 JPG、PNG 或 WebP，最大 5MB；后端返回的图片地址保存在 `imgUrl`。未上传图片时仍可使用 JSON 请求及可选 `imgUrl`。创建工单会生成站内通知和首条处理记录。

### AI 报修分析

`POST /ai/analyze`（仅用户角色）用于在提交报修前即时分析描述，请求体为 `{ "description": "宿舍灯闪烁并有焦味" }`。描述必填且最多 2000 个字符；成功响应返回 AI 建议故障分类及安全自查建议。危险场景的建议以停止使用、远离危险并联系校园维修人员为主。该接口不会创建工单。后端鉴权使用的角色值仍为 `student`。

AI 服务使用后端 `.env` 中的 `DEEPSEEK_API_KEY`，不得将密钥放到小程序或后台前端。未配置时接口返回 `503`，AI 服务暂时不可用时返回错误而不会伪装成分析成功。

### 查询我的工单

`GET /order/my`（需要登录）

成功时 `data` 为当前用户的工单数组，按创建时间倒序排列。

进行中的工单响应还包含 `expectedCompletionAt` 预计完成时间。待处理工单按配置的待处理时限与维修时限估算，维修中工单从最近一次进入维修状态的记录起按维修时限估算。该时间仅为预计，不是服务承诺。

### 撤销本人待处理工单

`POST /order/:id/cancel`（需要登录，仅工单所属用户可调用）

仅 `待处理` 状态的本人工单可以撤销。撤销后保留记录并将状态改为 `已撤销`；工单不存在或不属于当前用户时返回 `404`，工单已进入维修或完成状态时返回 `409`。

### 删除本人已完成或已撤销工单

`DELETE /order/:id/my`（需要登录，仅工单所属用户可调用）

仅 `已完成` 或 `已撤销` 状态的本人工单可以删除。此操作采用软删除：用户端列表不再显示，管理员仍可在后台查看历史记录；工单不存在或不属于当前用户时返回 `404`，状态不允许删除时返回 `409`。

### 查询全部工单（分页、状态筛选与搜索）

`GET /order/all?page=1&size=10&status=pending&q=宿舍&category=水电故障&location=1号楼&from=2026-10-01&to=2026-10-31&sort=waiting`（仅管理员）

管理员列表会排除状态为“已撤销”的工单，但仍会显示用户从小程序列表移除的历史工单，并标注删除来源；总数和分页结果遵循相同规则。

| 查询参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | 否 | `1` | 从 1 开始的正整数 |
| `size` | 否 | `10` | 每页数量，正整数 |
| `status` | 否 | 无 | `pending`、`processing` 或 `finished` |
| `q` | 否 | 无 | 最长 100 个字符；模糊搜索工单标题、故障描述、结构化/原始报修地点、报修人昵称及联系电话 |
| `category` | 否 | 无 | 按已知故障类型筛选 |
| `location` | 否 | 无 | 按楼栋、楼层、房间或报修地点模糊筛选 |
| `from` / `to` | 否 | 无 | 提交日期范围，格式 `YYYY-MM-DD` |
| `sort` | 否 | `newest` | `newest` 最新优先，`oldest` 最早优先，`waiting` 等待最久优先 |

默认按创建时间倒序排列；可用 `sort` 参数调整排序。成功响应：

```json
{
  "code": 200,
  "msg": "查询成功",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "size": 10,
    "totalPage": 0
  }
}
```

省略 `status` 时查询全部状态；无匹配结果时 `list` 为空数组且 `totalPage` 为 `0`。非法分页参数或状态返回 `400`。

### 管理员工单统计

`GET /order/stats`（仅管理员）

返回有效工单总数、各状态数量、故障分类与楼栋分布，以及由工单提交到首次完成状态的平均小时数。

`GET /admin/ai/insights`（仅管理员）根据匿名汇总的工单类别、楼栋、状态及最近六个月数量生成 AI 运营分析。接口不向 AI 服务发送报修人信息或原始故障描述；如果尚未配置 AI 密钥，仍返回统计数据，并将 `available` 设为 `false`。

`POST /admin/order/:id/ai-analysis`（仅管理员）根据该工单现有故障描述重新生成分类和安全自查建议，并更新工单的 `aiCategory`、`aiSuggest`。后台操作前会要求管理员确认；操作会写入审计记录。

### 管理维修人员与维修组

以下接口均仅管理员可调用。类型 `person` 表示维修人员，`team` 表示维修组。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/maintenance-staff` | 查询维修人员与维修组列表 |
| `POST` | `/maintenance-staff` | 新增维修人员或维修组 |
| `PUT` | `/maintenance-staff/:id` | 更新维修人员或维修组信息 |
| `DELETE` | `/maintenance-staff/:id` | 删除维修人员或维修组 |

创建和更新请求体示例：

```json
{
  "name": "水电维修组",
  "type": "team",
  "phone": "13800000000",
  "description": "负责校园水电维修"
}
```

`name` 必填且最多 100 个字符；`phone` 最多 30 个字符，`description` 最多 500 个字符，均可选。维修人员目录可在工单编辑的负责人字段中选择；也允许输入未登记的负责人名称。删除目录条目不会修改已分派工单中保存的负责人历史文本。

新增维修人员时必须附加 `username` 和 `password` 创建独立工作台账号；维修组不支持账号。用户名须匹配 `^[A-Za-z0-9._-]{3,64}$` 且不可重复；密码为 8 至 72 字节。更新人员时可调整 `username`，省略或留空 `password` 表示不重置密码；重复用户名返回 `409`。密码仅保存 bcrypt 哈希，列表不会返回密码哈希。

#### 维修人员工作台

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/maintenance/auth/login` | 公开 | 维修人员账号密码登录，返回 `role: maintenance` 的令牌 |
| `GET` | `/maintenance/orders` | 维修人员 | 仅列出分派给当前登录人员的工单及报修地点、描述、联系电话和图片等处理所需信息 |
| `POST` | `/maintenance/orders/:id/progress` | 维修人员 | 更新本人分派工单的处理进度及完工说明 |
| `POST` | `/maintenance/orders/:id/completion-evidence` | 维修人员 | 上传本人分派工单的完工照片，使用 multipart 字段 `image` |
| `GET` | `/maintenance/profile` | 维修人员 | 查询个人资料、工单状态统计 |
| `PUT` | `/maintenance/password` | 维修人员 | 修改登录密码，需提供当前密码和新密码 |
| `GET` | `/maintenance/notices` | 维修人员 | 查询本人分派工单的状态与处理通知 |

工作台仅允许将本人分派的待处理工单开始维修、将维修中工单标记完成；不允许查看或修改其他人员的工单，也不能编辑工单正文或重新分派。完工照片仅支持 JPG、PNG、WebP，最大 5MB。

登录请求体为 `{ "username": "repairer01", "password": "维修人员密码" }`；成功响应的 `data` 包含 `token` 和 `{ id, staffId, username, name, role }` 用户信息。进度更新请求体示例：`{ "status": "处理中" }` 或 `{ "status": "已完成", "completionNote": "已更换损坏部件并测试正常" }`；仅允许 `待处理 -> 处理中 -> 已完成` 的单向流转。完工照片上传成功后返回 `data.completionImgUrl`。

管理员后台提供负责人建议，按已开通工作台账号的维修人员当前待处理/维修中工单数量优先排序，并以历史平均完成时长作为次级参考。建议不会自动派单，须由管理员确认并保存。SLA 预警列表中的“立即处理”入口可直接打开对应工单处理界面。

### 用户站内通知

`GET /notifications/my`（需要登录）

返回当前用户最近 100 条通知及未读数量。

`PUT /notifications/:id/read`（需要登录）

仅允许将当前用户自己的通知标记为已读；重复标记成功且保持幂等。

### 查询工单详情

`GET /order/:id`（需要登录；管理员可查看全部，普通用户只能查看自己的工单）

成功时 `data` 为工单对象，包含处理时间线、负责人和评价（如有）；工单不存在返回 `404`，无权查看返回 `403`。

### 工单补充沟通

- `GET /order/:id/messages`：按时间顺序返回当前工单最近最多 200 条沟通消息。普通用户只能访问自己的工单；管理员可查看管理端工单。
- `POST /order/:id/messages`：为工单添加补充信息。JSON 请求体为 `{ "content": "补充说明" }`；可选通过 `multipart/form-data` 同时上传 `image` 文件及 `content`。内容必须为 1 至 2000 个字符，图片格式和大小限制与报修图片相同。管理员回复会为工单用户创建站内通知。

### 个人资料

- `GET /user/profile`：读取当前微信用户的昵称、联系电话和注册时间。
- `PUT /user/profile`：更新当前用户的 `nickname`（1 至 64 个字符）和 `phone`（可空；填写时须为有效联系电话）。不会接收或修改 `role`、`openid` 等鉴权字段。
- `POST /user/profile/avatar`：使用 `multipart/form-data` 上传字段 `image` 设置当前用户头像，仅支持 JPG、PNG 或 WebP，最大 5MB。头像图片保存在后端上传目录，响应返回 `avatarUrl`。

### 更新工单状态

`PUT /order/:id/status`（仅管理员）

请求体：

```json
{
  "status": "processing",
  "adminRemark": "已安排维修",
  "assignedTo": "水电维修组"
}
```

`status` 必须为上述状态枚举之一，`adminRemark` 和 `assignedTo` 可选。已完成工单不可再编辑，尝试更新返回 `409`。状态或负责人变更会写入处理记录并产生用户站内通知；备注变更写入处理记录。

### 用户评价已完成工单

`POST /order/:id/review`（需要登录，仅工单所属用户可调用）

请求体：`{ "rating": 5, "comment": "维修及时，服务很好", "feedbackType": "quality" }`。仅已完成工单可评价，评分为 1 至 5 整数，每张工单只允许提交一次；评价内容可选，最多 1000 个字符。评价类型可选：`quality`（维修质量）、`communication`（沟通服务）、`speed`（处理速度）、`result`（问题解决）或 `other`（其他）。

### 管理员查看工单评价

`GET /order/reviews?page=1&size=10&q=漏水`（仅管理员）

按评价时间倒序返回已完成工单的评价列表，包含评价、对应工单和评价用户信息。`page` 为正整数，`size` 为 1 至 100；`q` 可选且最多 100 个字符，可搜索评价内容、管理员跟进、工单标题/地点及评价用户昵称/电话。平均评分和低分数量在搜索时按匹配结果计算。成功响应的 `data` 包含 `list`、`total`、`page`、`size` 和 `totalPage`。

`PUT /order/reviews/:id/followup`（仅管理员）用于记录评价跟进，请求体为 `{ "note": "已联系用户并安排复查" }`。跟进内容最多 1000 个字符；传入空字符串会清除跟进内容。评价列表中的平均评分和低分数量仅统计已完成工单。

### 工单完工确认与重新处理

| 方法 | 路径 | 权限及用途 |
| --- | --- | --- |
| `POST` | `/order/:id/confirm-completion` | 用户仅可确认自己的已完成工单 |
| `POST` | `/order/:id/reopen-request` | 用户为自己的已完成工单申请重新处理 |
| `POST` | `/order/:id/reopen` | 管理员接受待处理的重新处理申请 |
| `POST` | `/order/:id/completion-evidence` | 管理员为尚未完成的工单上传完工照片 |

重新处理申请请求体为 `{ "reason": "故障仍未排除" }`，原因必填，最多 1000 个字符。管理员接受后工单回到“处理中”，并向用户发送站内通知。完工照片通过 `multipart/form-data` 的 `image` 字段上传；接口返回 `completionImgUrl`。工单详情包含完工说明、照片、用户确认时间及重新处理申请信息。上述用户接口会校验用户角色和工单归属；鉴权使用的角色值仍为 `student`，管理员操作仅允许管理员角色。

管理员可在 `PUT /order/:id/status` 请求体中传入 `assignedStaffId` 指定维修人员/维修组，传入 `completionNote` 设置完工说明（最多 2000 个字符）。已完成工单不可通过状态接口编辑。

### 维修工作量

`GET /maintenance-staff/workload`（仅管理员）返回维修人员、维修组各自的工单总数、待处理/维修中/已完成数量及平均完成耗时，并附带未分派工单统计。工作量优先按维修人员关联 ID 统计；历史数据没有关联 ID 时兼容负责人名称。

### SLA 时限与预警

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/order/sla-settings` | 查询 SLA 时限（仅管理员） |
| `PUT` | `/order/sla-settings` | 更新 SLA 时限（仅管理员） |
| `GET` | `/order/sla-alerts` | 查询临近及已逾期工单（仅管理员） |

更新请求体示例：`{ "pendingHours": 24, "processingHours": 72 }`。两个值都必须是 1 至 720 的整数。达到时限的 80% 会列为临近预警，达到或超过时限会标记逾期。预警在管理员后台展示并提供“立即处理”入口，不会自动变更工单或发送推送。

### 报修目录管理

`GET /catalog`（需要登录）返回启用的故障类型及楼栋。以下管理接口仅管理员可调用：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/admin/catalog` | 查询全部目录项（含已停用项） |
| `POST` | `/admin/catalog` | 新增目录项；若相同名称的目录项已停用，则重新启用该项 |
| `PUT` | `/admin/catalog/:id` | 修改目录类型或名称 |
| `PUT` | `/admin/catalog/:id/activate` | 按目录项 ID 重新启用停用项 |
| `DELETE` | `/admin/catalog/:id` | 停用目录项，不物理删除 |

创建/更新请求体示例：`{ "type": "category", "value": "网络故障" }`；`type` 只能是 `category` 或 `building`，名称必填且最多 100 个字符。同类型名称不可重复。停用所有故障类别后，用户不能再选择目录类别；只有目录从未初始化时才使用兼容默认值。

### 管理员审计记录

`GET /admin/audit-logs?page=1&size=20&q=导出`（仅管理员）按时间倒序分页查询管理员审计记录，记录管理员、操作类型、目标类型/编号及必要操作详情。`page` 为正整数，`size` 为 1 至 100；`q` 可选且最多 100 个字符，可搜索操作类型、目标类型/编号、操作详情、管理员姓名或用户名。

### 工单 CSV 报表

`GET /reports/orders.csv`（仅管理员）导出工单 CSV，支持与后台列表相同的 `status`、`category`、`location`、`q`、`from`、`to`、`sort` 筛选参数。日期格式为 `YYYY-MM-DD`；导出会对以公式字符开头的单元格内容进行转义，避免表格软件将其作为公式执行。

## 数据库结构和图片存储

后端启动时会创建尚不存在的数据表，并通过 `ensure-workflow-fields.js` 对列出的兼容字段逐列补齐（包括地图地点、补充说明、评价类型和维修人员工作台账号字段）；不会调用 Sequelize `alter` 修改整个已有表结构，以避免在 MySQL 上重复创建索引。新增工单沟通表由正常模型同步创建；其他数据库结构变更仍应使用明确迁移。不要在服务每次启动时运行 `sync({ alter: true })`。

图片文件存放在 `backend/uploads`。生产部署必须将此目录挂载为持久化卷并纳入备份；如果更换服务器或清理本地磁盘而未迁移图片，已有工单图片链接会失效。

本项目提供数据库与图片文件备份/恢复脚本（从 `backend` 目录运行）。备份要求系统 PATH 中安装 `mysqldump`，默认输出到 `backend/backups/backup-<时间戳>`；也可指定备份根目录：

```powershell
npm run backup
npm run backup -- "D:\campus-repair-backups"
```

恢复会覆盖数据库中的同名表，必须显式确认，并且要求备份目录同时含有 `database.sql` 和 `uploads/`：

```powershell
npm run restore -- "D:\campus-repair-backups\backup-<时间戳>" --confirm
```

恢复要求 PATH 中安装 `mysql`。恢复前应另行备份当前数据库，并在隔离环境先验证备份可用；生产环境应限制备份目录访问、加密备份介质并定期执行恢复演练。连接参数从后端 `.env` 读取。

### 删除工单

`DELETE /order/:id`（仅管理员）

成功响应：

```json
{
  "code": 200,
  "msg": "工单删除成功",
  "data": null
}
```

仅已完成工单可以由管理员删除；待处理或维修中的工单返回 `409`。该操作只在管理员后台隐藏工单，不会影响用户端“我的工单”及详情；用户端主动删除仍使用独立的软删除标记。不存在或已在管理员端隐藏的工单返回 `404`。

## PowerShell 测试

先启动后端，再准备一个管理员令牌和一个普通用户令牌。可直接运行仓库中的两步验证脚本：

```powershell
.\tests\test-order-all.ps1 -AdminToken "<管理员token>" -UserToken "<普通用户token>"
```

也可以分别手动测试：

```powershell
$adminHeaders = @{ Authorization = "Bearer <管理员token>" }
Invoke-RestMethod -Uri "http://localhost:3000/api/order/all?page=1&size=10&status=pending" -Method Get -Headers $adminHeaders
```

```powershell
$userHeaders = @{ Authorization = "Bearer <普通用户token>" }
try {
  Invoke-RestMethod -Uri "http://localhost:3000/api/order/all?page=1&size=10&status=pending" -Method Get -Headers $userHeaders
} catch {
  $_.Exception.Response.StatusCode
}
```

第二条请求预期返回 HTTP `403 Forbidden`。

## 撤销工单联调测试

后端单元测试：

```powershell
npm test
```

连接正在运行的后端和开发数据库进行端到端测试（需要用户 token；管理员 token 可选，用于额外验证“维修中不可撤销”）：

```powershell
.\tests\test-order-cancel.ps1 -UserToken "<用户token>" -AdminToken "<管理员token>"
```

脚本会创建用于测试的工单。成功撤销的测试工单会保留在数据库并显示为 `已撤销`；提供管理员 token 时还会创建一条进入维修状态的测试工单。
