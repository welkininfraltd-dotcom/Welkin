# 🏗️ Construction Cash Tracker

Mobile-first PWA for construction project teams to record daily cash entries.
Site engineers pay vendors on-site and log every payment here. The owner (admin)
reviews, approves/rejects entries, and tracks spending across all project sites.

All data syncs to **Google Sheets**. Invoice photos are stored in **Google Drive**.

## Features

| Feature | Description |
|---------|-------------|
| 📝 Cash Entry | Date, vendor, item, qty, rate, amount — one-tap save |
| 📦 Item Master | 100+ standardized items mapped from Hindi/local names |
| 📸 Invoice Photo | Capture or upload invoice → saved to Google Drive |
| ☁️ Google Sheet Sync | Every entry writes to your Google Sheet |
| 👑 Admin Panel | Create sites, add engineers, reconcile entries |
| ✅ Reconciliation | Admin approves/rejects each entry |
| 🔔 Notifications | Admin notified on new entries; engineer on approval |
| 📊 Dashboard | Category-wise spending, top vendors, totals |
| 👤 Auth | Mobile + password login; admin creates accounts |
| 📱 PWA | Install on Android home screen like a native app |

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌────────────────┐
│ Android PWA  │────▶│  FastAPI      │────▶│ Google Sheets  │
│ (Browser)    │◀────│  Backend      │────▶│ Google Drive   │
└──────────────┘     └──────────────┘     └────────────────┘
```

## Quick Start

### 1. Install dependencies
```bash
cd construction-cash-tracker
pip install -r requirements.txt
```

### 2. Google Cloud Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Google Sheets API** and **Google Drive API**
3. Create a **Service Account** → Download JSON key as `credentials.json`
4. Create a Google Spreadsheet → Share it with the service account email
5. Create a Google Drive folder for invoices → Share with service account

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env`:
```
GOOGLE_CREDENTIALS_PATH=credentials.json
SPREADSHEET_ID=<your-spreadsheet-id-from-url>
GDRIVE_FOLDER_ID=<your-drive-folder-id>
SECRET_KEY=<random-secret-string>
ADMIN_MOBILE=9999999999
ADMIN_NAME=Owner
```

### 4. Run the app
```bash
python run.py
```
Open `http://localhost:8000` on your phone (same WiFi) or deploy to a server.

### 5. First Login
- Mobile: `9999999999` (or your ADMIN_MOBILE)
- Password: `admin123`
- Change the password after first login

### 6. Install on Android
1. Open the app URL in Chrome on Android
2. Tap the menu (⋮) → "Add to Home Screen"
3. The app icon appears on your home screen like a native app

## User Roles

| Role | Can Do |
|------|--------|
| **Admin (Owner)** | Create sites, add engineers, view all sites, approve/reject entries, see dashboard |
| **Site Engineer** | Login, make entries for assigned site, upload invoices, see own history |

## Google Sheet Structure

The app creates these sheets in your spreadsheet:

- **APP_Users** — User accounts (mobile, name, password hash, role, site)
- **APP_Sites** — Project sites (site_id, name, location, sheet reference)
- **APP_Notifications** — In-app notifications
- **[Site Sheet]** — One data sheet per site with columns A-S matching your format

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login with mobile + password |
| POST | `/api/users` | Admin | Create site engineer account |
| GET | `/api/users` | Admin | List all users |
| POST | `/api/sites` | Admin | Create project site |
| GET | `/api/sites` | Any | List sites (filtered by role) |
| POST | `/api/entries/{site_id}` | Any | Create cash entry |
| GET | `/api/entries/{site_id}` | Any | List entries (optional status filter) |
| POST | `/api/reconcile/{site_id}` | Admin | Approve/reject entry |
| POST | `/api/invoices/{site_id}/{entry_id}` | Any | Upload invoice photo |
| GET | `/api/invoices/{site_id}` | Any | List invoice files |
| GET | `/api/notifications` | Any | Get user notifications |
| GET | `/api/items` | Any | Get item master data |

## Deployment

For production, deploy on any cloud VM or PaaS:

```bash
# Using gunicorn (Linux)
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Using Docker
docker build -t cash-tracker .
docker run -p 8000:8000 --env-file .env cash-tracker
```

Use a reverse proxy (nginx/Caddy) with HTTPS for production — required for PWA
camera access on Android.
