# RotaApp — Workforce Scheduling

A full-featured workforce scheduling (rota) web application similar to Humanity.com.

## Features

- **Shift scheduling** — drag-and-drop calendar (month/week/day views)
- **Shift trades** — employees request swaps; managers approve
- **Time-off requests** — employee submits, manager approves/rejects with email notification
- **Clock in / Clock out** — attendance tracking from the top bar
- **Real-time notifications** — Socket.io in-app + Nodemailer email
- **Role-based access** — Admin / Manager / Employee
- **Reports** — hours worked, estimated pay, overtime, shift coverage
- **Mobile responsive** — Tailwind CSS, works on all screen sizes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Calendar | FullCalendar 6 (drag & drop) |
| State | TanStack Query v5 |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 via Prisma ORM |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Real-time | Socket.io |
| Email | Nodemailer |

## Prerequisites

- **Node.js** 18+
- **Docker Desktop** (for PostgreSQL) — or an existing PostgreSQL instance

---

## Setup Instructions

### 1 — Start the database

```bash
cd RotaApp
docker-compose up -d
```

Wait ~10 seconds for PostgreSQL to be ready.

### 2 — Configure the backend

```bash
cd backend
copy .env.example .env
```

The default `.env` values work with the Docker Compose PostgreSQL. Edit the
`SMTP_*` variables if you want email; leave them blank to skip (emails just
print to the console).

### 3 — Install backend dependencies & migrate

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The seed creates demo accounts (see below) and sample shifts for the current week.

### 4 — Start the backend

```bash
npm run dev
```

API is running at **http://localhost:4000**

### 5 — Install & start the frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend is running at **http://localhost:5173**

---

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@rotaapp.com | admin123 |
| Manager | manager@rotaapp.com | manager123 |
| Employee | alice@rotaapp.com | employee123 |
| Employee | bob@rotaapp.com | employee123 |

---

## Testing Each Feature

### Authentication
- Navigate to http://localhost:5173 — redirected to login
- Sign in with any demo account

### Shift Scheduling (Admin / Manager)
- Go to **Schedule** — see the FullCalendar with colour-coded shifts
- **Click any empty date** to create a new shift
- **Click an existing shift** to edit or cancel it
- **Drag a shift** to a different day to reschedule it
- Use the week/day views for time-slot precision

### Shift Trades (All roles)
- Go to **Shift Trades** → **+ Request Trade**
- Select one of your upcoming shifts and submit
- Log in as another employee → accept/reject it
- Log in as manager → approve the accepted trade

### Time-Off Requests (All roles)
- Go to **Time Off** → **+ Request Time Off**
- Submit a date range and type
- Log in as manager → approve or reject
- The requesting employee receives an in-app notification

### Clock In / Clock Out
- The **Clock In** / **Clock Out** button is in the top bar
- Click it to toggle; the timer shows elapsed time
- Go to **Attendance** to view the full record log

### Notifications
- The 🔔 bell in the top bar shows unread notifications
- Notifications are created automatically when shifts are assigned,
  trades are requested/approved, and time-off is decided
- Real-time delivery via Socket.io (no page refresh needed)

### Reports (Admin / Manager only)
- Go to **Reports**
- Set a date range and choose Hours / Overtime / Coverage tabs
- Hours tab shows total hours clocked and estimated pay per employee
- Overtime tab shows any employee who exceeded 40h in a week
- Coverage tab shows scheduled shifts per day

### Team Management (Admin / Manager)
- Go to **Team** → **+ Add Employee** to create a user
- Edit name, role, hourly rate
- Deactivate users (Admin only)

---

## API Endpoints

```
POST   /api/auth/login
GET    /api/auth/me
PUT    /api/auth/change-password

GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id

GET    /api/shifts
POST   /api/shifts
POST   /api/shifts/bulk
PUT    /api/shifts/:id
DELETE /api/shifts/:id

GET    /api/shift-trades
POST   /api/shift-trades
PUT    /api/shift-trades/:id/respond
PUT    /api/shift-trades/:id/approve
PUT    /api/shift-trades/:id/cancel

GET    /api/time-off
POST   /api/time-off
PUT    /api/time-off/:id
DELETE /api/time-off/:id

POST   /api/clock/in
POST   /api/clock/out
GET    /api/clock/status
GET    /api/clock/records
PUT    /api/clock/records/:id

GET    /api/reports/dashboard
GET    /api/reports/hours
GET    /api/reports/overtime
GET    /api/reports/coverage

GET    /api/notifications
GET    /api/notifications/unread-count
PUT    /api/notifications/mark-all-read
PUT    /api/notifications/:id/read
```

---

## Environment Variables

### backend/.env

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | see .env.example |
| `JWT_SECRET` | Secret key for JWT signing | change in production |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `PORT` | API server port | `4000` |
| `CLIENT_URL` | Frontend origin for CORS | `http://localhost:5173` |
| `SMTP_HOST` | Email SMTP host | optional |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | optional |
| `SMTP_PASS` | SMTP password | optional |
| `SMTP_FROM` | From address | optional |

For free SMTP testing use [Ethereal Email](https://ethereal.email) — create a
free account, copy the credentials into your `.env`, then view sent emails in
the Ethereal web UI.

---

## Project Structure

```
RotaApp/
├── docker-compose.yml
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── seed.ts             # Demo data
│   └── src/
│       ├── index.ts            # Express server entry
│       ├── lib/                # prisma, socket, email helpers
│       ├── middleware/         # auth, error handler
│       ├── controllers/        # Business logic per domain
│       └── routes/             # Express routers
└── frontend/
    └── src/
        ├── api/                # Axios API wrappers
        ├── components/         # Layout, modals, widgets
        ├── contexts/           # Auth, Socket providers
        ├── pages/              # Route-level page components
        └── types/              # Shared TypeScript types
```

