# 校园 AI 报修管理后台

Vue 3 + Vite + Element Plus 实现的管理员工单管理界面和维修人员工作台。

## 启动

```powershell
cd admin-web
npm install
npm run dev
```

浏览器打开 Vite 地址（默认 `http://localhost:5173`）。后端地址为 `http://localhost:3000`，Axios 默认 API 基础地址为 `http://localhost:3000/api`。可通过 `VITE_API_BASE_URL` 环境变量覆盖 API 基础地址。

## 登录与鉴权

登录页支持管理员和维修人员账号。管理员使用 `POST /api/auth/adminlogin`；维修人员使用 `POST /api/maintenance/auth/login`。维修人员账号由管理员在维修人员管理中创建，登录后只能查看分派给自己的工单并更新处理进度。

登录页调用 `POST /api/auth/adminlogin`，请求体为 `{ "username": "管理员账号", "password": "管理员密码" }`。成功后保存 `data.token`，后续请求自动添加 `Authorization: Bearer <token>`。路由守卫要求已保存 token；收到 HTTP 或统一响应中的 401 时清除 token 并跳转登录页。

## 使用的现有接口

- `POST /api/auth/adminlogin`：管理员账号密码登录。
- `GET /api/order/all?page=1&size=10&status=pending`：管理员分页查询工单及筛选状态。
- `GET /api/order/:id`：查看工单详情。
- `PUT /api/order/:id/status`：更新工单状态与管理员备注。
- `DELETE /api/order/:id`：管理员删除工单。

管理员可在工单编辑时查看按当前在办工作量及历史平均完成时长排序的负责人建议，并确认后分派；超时 SLA 预警提供快捷处理入口。管理员还可生成地点二维码，小程序扫码后预填楼栋、楼层和房间。状态值为 `pending`（待处理）、`processing`（维修中）和 `finished`（已完成）。
