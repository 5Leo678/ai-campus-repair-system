# Campus AI Repair System

AI-assisted campus repair management system with a WeChat Mini Program, Vue 3 administration and maintenance workbench, Express backend, MySQL and DeepSeek analysis.

## Features

- WeChat Mini Program login and repair submission
- Draft management, map location, location QR codes and image upload
- Student repair tracking, notifications, messaging and review
- Administrator statistics, SLA, catalog, work order, staff and audit management
- Maintenance workbench with assignment, progress, evidence and communication
- DeepSeek-powered repair analysis and admin insights

## Technology

| Part | Stack |
|---|---|
| Mini Program | Native WeChat Mini Program WXML / WXSS / JavaScript |
| Admin | Vue 3, Vite, Element Plus, Pinia |
| Backend | Node.js, Express, Sequelize |
| Database | MySQL |
| Authentication | JWT, bcrypt |
| AI | DeepSeek API |

## Local Setup

### 1. MySQL

Create a database:

```sql
CREATE DATABASE campus_repair CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

### 2. Backend

```powershell
cd backend
copy .env.example .env
npm install
npm test
npm start
```

Configure database credentials, `JWT_SECRET`, WeChat credentials and optional DeepSeek API settings in `backend/.env`.

### 3. Admin Web

```powershell
cd admin-web
npm install
npm run dev
```

Open `http://localhost:5173`.

### 4. Mini Program

Open the `miniprogram` directory in WeChat Developer Tools.

- Replace `project.config.json` AppID with your own AppID.
- Set `utils/request.js` API address to the reachable backend address.
- Configure `WX_APPID` and `WX_APP_SECRET` in `backend/.env`.

## Docker

```powershell
docker compose up --build
```

- Admin: `http://localhost:5173`
- API: `http://localhost:3000/api`
- MySQL: `localhost:3306`

Copy `backend/.env.example` to `backend/.env` before Docker startup.

## Test

```powershell
cd backend
npm test

cd ../admin-web
npm run build
```

## API

See [OpenAPI document](docs/openapi.yaml) and [API notes](backend/API.md).

## Security

- Never commit `.env`, database dumps or uploaded repair images.
- Use separate development and production secrets.
- Rotate any keys that have been committed before the repository becomes public.
- Restrict production CORS origins and expose the API only through HTTPS.
