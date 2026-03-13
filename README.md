# ✈ Flight Price Tracker

Automated daily flight price monitoring with Telegram alerts and a Vercel dashboard.

- **Domestic cash fares**: YYC/YYZ routes via Google Flights + Kayak
- **Qatar award availability**: Business Class (Qsuite) YYZ→ISB and YYZ→IST
- **One Telegram message per day** — a condensed digest of all alerts
- **RapidAPI budget control** — capped at 10 requests/month automatically
- **ML price forecasting** — 7-day predictions with confidence scores

---

## Monitored Routes

### Cash Fares (Air Canada · WestJet · Flair)

| Monitor ID | Route | Date Window | Threshold |
|---|---|---|---|
| `yyc-yyz-jul2-window` | YYC → YYZ | Jun 28 – Jul 6, 2026 | CAD 180 |
| `yyc-yyz-jul13-window` | YYC → YYZ | Jul 9 – Jul 17, 2026 | CAD 180 |
| `yyc-yyz-jul14-window` | YYC → YYZ | Jul 10 – Jul 18, 2026 | CAD 180 |
| `yyz-yyc-june-last-week` | YYZ → YYC | Jun 24 – Jun 30, 2026 | CAD 180 |
| `yyz-yyc-may8-window` | YYZ → YYC | May 3 – May 13, 2026 | CAD 160 |
| `yyz-yyc-jun10` | YYZ → YYC | Jun 8 – Jun 12, 2026 | CAD 180 |
| `yyc-yyz-jun13` | YYC → YYZ | Jun 11 – Jun 15, 2026 | CAD 180 |

### Qatar Awards (Business Class · Privilege Club)

| Monitor ID | Route | Month |
|---|---|---|
| `qatar-award-yyz-isb-jun2027` | YYZ → ISB | June 2027 |
| `qatar-award-yyz-isb-jul2027` | YYZ → ISB | July 2027 |
| `qatar-award-yyz-isb-dec2027` | YYZ → ISB | December 2027 |
| `qatar-award-yyz-ist-jun2027` | YYZ → IST | June 2027 |
| `qatar-award-yyz-ist-jul2027` | YYZ → IST | July 2027 |
| `qatar-award-yyz-ist-dec2027` | YYZ → IST | December 2027 |

---

## Project Structure

```
flight-tracker/
├── scraper/
│   ├── main.py              ← Entry point (run this in GitHub Actions)
│   ├── monitors.py          ← All route configurations
│   ├── db.py                ← PostgreSQL helpers + RapidAPI budget tracking
│   ├── telegram_bot.py      ← Single condensed digest sender
│   ├── predictor.py         ← ML price forecasting (scikit-learn)
│   └── adapters/
│       ├── base.py          ← Playwright utilities, stealth, retries
│       ├── rapidapi.py      ← Sky Scrapper API (10/month budget)
│       ├── google_flights.py ← Primary Playwright scraper
│       ├── kayak.py         ← Fallback Playwright scraper
│       └── qatar_award.py   ← seats.aero API + Qatar website scraper
├── dashboard/               ← Next.js 14 Vercel dashboard
│   ├── app/
│   │   ├── page.tsx         ← Monitor cards + status
│   │   ├── history/[id]/    ← Price history + ML chart
│   │   ├── awards/          ← Qatar award availability
│   │   ├── alerts/          ← Alert history log
│   │   ├── runs/            ← Scraper run history
│   │   └── api/revalidate/  ← Cache revalidation webhook
│   ├── components/
│   │   └── PriceChart.tsx   ← Recharts line chart
│   └── lib/
│       ├── db.ts            ← PostgreSQL queries
│       └── monitors.ts      ← Route config (mirrors monitors.py)
├── .github/workflows/
│   └── daily-flight-check.yml  ← GitHub Actions cron (07:17 AM ET)
├── requirements.txt
└── .env.example
```

---

## Setup

### Step 1 — Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/flight-tracker.git
cd flight-tracker
cp .env.example .env
# Edit .env with your credentials
```

### Step 2 — Create a PostgreSQL database

Free options: [Supabase](https://supabase.com), [Neon](https://neon.tech), [Vercel Postgres](https://vercel.com/storage/postgres)

The schema is created automatically on first run. Or run manually:

```bash
pip install -r requirements.txt
python -c "import dotenv, scraper.db as db; dotenv.load_dotenv(); db.run_schema(); print('Done')"
```

### Step 3 — Create a Telegram Bot

1. Message **@BotFather** on Telegram → `/newbot` → follow prompts → copy the **bot token**
2. Start a chat with your new bot
3. Get your chat ID:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   Find `"chat": {"id": 123456789}` in the response

### Step 4 — Get a RapidAPI key (optional but recommended)

1. Sign up at [rapidapi.com](https://rapidapi.com/apiheya/api/sky-scrapper)
2. Subscribe to Sky Scrapper (has a free tier)
3. Copy your `X-RapidAPI-Key`

The tracker **automatically caps RapidAPI at 10 calls/month** via DB tracking. Beyond that it falls back to Playwright scraping.

### Step 5 — Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions**:

| Secret | Required | Description |
|--------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | ✅ | Token from @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | Your Telegram chat ID |
| `RAPIDAPI_KEY` | Optional | Sky Scrapper API key |
| `PROXY_ENDPOINT` | Optional | Residential proxy (reduces blocks) |
| `PROXY_USERNAME` | Optional | Proxy credentials |
| `PROXY_PASSWORD` | Optional | Proxy credentials |
| `SEATS_AERO_API_KEY` | Optional | seats.aero Partner API |
| `VERCEL_REVALIDATE_URL` | Optional | Dashboard cache refresh URL |

### Step 6 — Deploy the dashboard to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Set **Root Directory** to `dashboard`
4. Add environment variables: `DATABASE_URL`, `REVALIDATE_SECRET`
5. Deploy

Then update `VERCEL_REVALIDATE_URL` in GitHub Secrets:
```
https://your-app.vercel.app/api/revalidate?secret=YOUR_REVALIDATE_SECRET
```

### Step 7 — Test

**Manual trigger** from GitHub: Actions → Daily Flight Price Check → Run workflow

**Local test:**
```bash
pip install -r requirements.txt
python -m playwright install chromium --with-deps
cp .env.example .env  # fill in DATABASE_URL + Telegram tokens
python -m scraper.main
```

---

## The Fix: Ubuntu 24.04 `libasound2` Bug

The GitHub Actions workflow is pinned to `ubuntu-22.04` to avoid the Ubuntu 24.04 package rename bug:

```
E: Package 'libasound2' has no installation candidate
```

On Ubuntu 24.04, `libasound2` was renamed to `libasound2t64`, causing `playwright install --with-deps` to fail. Pinning to `ubuntu-22.04` resolves this completely.

---

## Telegram Digest Format

One message per day covering all monitors:

```
✈ Flight Price Daily Digest
📅 Mar 13 2026, 7:17 AM ET
━━━━━━━━━━━━━━━━━━━━

🏷 CASH FARE ALERTS

🏆 YYC → YYZ — NEW ALL TIME LOW
   💰 CAD 142.50
   📆 2026-07-02
   ✈ Flair Airlines
   ⏱ 4h 25m · Nonstop
   📉 Prev best: CAD 171.00  (save CAD 28.50)
   🔗 Book Now

🎫 QATAR AIRWAYS AWARD AVAILABILITY
   Business / Qsuite from YYZ

✈ YYZ→IST
   📅 Jun 2027: 65,000 Avios + CAD 248.00 taxes
   🔗 Book on Qatar

📋 TODAY'S BEST CASH FARES
   YYC→YYZ: CAD 142.50 on 2026-07-02 via Flair Airlines

━━━━━━━━━━━━━━━━━━━━
📊 14 monitors · 89 quotes · 2 alerts
```

---

## Cost Estimate

| Service | Cost |
|---------|------|
| GitHub Actions (public repo) | Free |
| Vercel Hobby (dashboard) | Free |
| Supabase / Neon (free tier DB) | Free |
| RapidAPI Sky Scrapper (10 calls/month) | Free |
| Telegram Bot API | Free |
| Residential proxy *(optional)* | ~$10–50/month |
| seats.aero Partner API *(optional)* | ~$10/month |
| **Total (no extras)** | **$0/month** |

---

## Adding / Changing Routes

Edit `scraper/monitors.py` and `dashboard/lib/monitors.ts` (both files must stay in sync). Then run the migration:

```bash
python -c "import dotenv, scraper.db as db; dotenv.load_dotenv(); db.run_schema(); from scraper.monitors import ALL_MONITORS; db.seed_monitors(ALL_MONITORS)"
```
