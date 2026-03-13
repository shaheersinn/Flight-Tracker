# ✈️ Flight Price Tracker

Automated daily flight price monitoring with Telegram alerts and a Vercel dashboard.

Monitors **YYC↔YYZ domestic routes** and **Qatar Airways award availability** from YYZ to Islamabad (ISB) and Istanbul (IST).

---

## Features

- **Daily automated scraping** via GitHub Actions (07:17 AM Toronto time)
- **Multi-provider strategy**: RapidAPI → Google Flights (Playwright) → Kayak fallback
- **RapidAPI budget control**: max 10 requests/month, tracked in DB
- **Qatar Airways awards**: scrapes Privilege Club + optional seats.aero API
- **ONE condensed Telegram alert** per day (all monitors in a single digest)
- **ML price prediction**: 7-day forecasts using scikit-learn
- **Vercel dashboard**: price history charts, award calendar, alert log

---

## Routes Monitored

### Cash Fares (Air Canada / WestJet / Flair)

| Monitor | Route | Date Window |
|---------|-------|-------------|
| `yyc-yyz-jul2-window` | YYC → YYZ | Jun 28 – Jul 6, 2026 (±4 days from Jul 2) |
| `yyc-yyz-jul13-window` | YYC → YYZ | Jul 9 – Jul 17, 2026 |
| `yyc-yyz-jul14-window` | YYC → YYZ | Jul 10 – Jul 18, 2026 |
| `yyz-yyc-june-last-week` | YYZ → YYC | Jun 24 – Jun 30, 2026 |
| `yyz-yyc-may8-window` | YYZ → YYC | May 3 – May 13, 2026 (±5 days from May 8) |
| `yyz-yyc-jun10` | YYZ → YYC | Jun 8 – Jun 12, 2026 |
| `yyc-yyz-jun13` | YYC → YYZ | Jun 11 – Jun 15, 2026 |

### Qatar Airways Awards (Business Class / Qsuite)

| Destination | Months |
|-------------|--------|
| YYZ → ISB (Islamabad) | Jun 2027, Jul 2027, Dec 2027 |
| YYZ → IST (Istanbul) | Jun 2027, Jul 2027, Dec 2027 |

---

## Setup

### Prerequisites

- GitHub account (free)
- Vercel account (free Hobby plan)
- PostgreSQL database: [Vercel Postgres](https://vercel.com/storage/postgres), [Supabase](https://supabase.com), or [Neon](https://neon.tech) (all have free tiers)
- Telegram bot token (free)
- RapidAPI key for Sky Scrapper (free tier: 10+ calls/month)
- *(Optional)* Residential proxy for anti-bot bypass (~$10–50/month)
- *(Optional)* seats.aero Partner API key for award availability

---

### Step 1: Clone & Configure

```bash
git clone https://github.com/YOUR_USERNAME/flight-tracker.git
cd flight-tracker
cp .env.example .env
# Edit .env with your credentials
```

---

### Step 2: Create PostgreSQL Database

Run the schema on your database:

```bash
# Set DATABASE_URL in your shell, then:
npm run db:migrate
```

Or run the SQL manually from `apps/worker/src/db/schema.sql`.

---

### Step 3: Create Telegram Bot

1. Message **@BotFather** on Telegram
2. Send `/newbot` → follow prompts → save the **bot token**
3. Start a chat with your bot
4. Get your chat ID:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   Look for `"chat": {"id": 123456789}`

---

### Step 4: Get RapidAPI Key

1. Go to [Sky Scrapper on RapidAPI](https://rapidapi.com/apiheya/api/sky-scrapper)
2. Subscribe (free tier available)
3. Copy your `X-RapidAPI-Key`

The tracker limits RapidAPI to **10 calls/month** automatically. Beyond that, it falls back to Playwright scraping.

---

### Step 5: Add GitHub Secrets

Go to your GitHub repo → **Settings → Secrets → Actions** → add:

| Secret | Value |
|--------|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `RAPIDAPI_KEY` | Sky Scrapper RapidAPI key |
| `PROXY_ENDPOINT` | *(optional)* Proxy server URL |
| `PROXY_USERNAME` | *(optional)* Proxy credentials |
| `PROXY_PASSWORD` | *(optional)* Proxy credentials |
| `SEATS_AERO_API_KEY` | *(optional)* seats.aero Partner API |
| `VERCEL_REVALIDATE_URL` | Dashboard revalidation URL |

---

### Step 6: Deploy Dashboard to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Configure:
   - **Root Directory**: `apps/web`
   - **Framework**: Next.js
   - **Environment Variables**: Add `DATABASE_URL` and `REVALIDATE_SECRET`
4. Click **Deploy**

Set the Vercel dashboard URL as a GitHub secret:
```
VERCEL_REVALIDATE_URL=https://your-app.vercel.app/api/revalidate?secret=YOUR_SECRET
```

---

### Step 7: Test

Trigger a manual run from GitHub:

> **Actions → Daily Flight Price Check → Run workflow**

Or test locally:
```bash
cp .env.example .env  # Fill in values
npm install
npm run worker:scrape
```

---

## Telegram Digest Format

One message per day covering all monitors:

```
✈️ Flight Price Daily Digest
📅 Mar 12, 2026, 7:17 AM (Toronto)
━━━━━━━━━━━━━━━━━━━━

🏷️ CASH FARE ALERTS

🏆 YYC → YYZ — NEW ALL-TIME LOW
   💰 CAD 142.50
   📆 2026-07-02
   ✈️ Flair Airlines F8803
   ⏱ 4h 25m | Nonstop
   📉 Previous best: CAD 171.00 (save CAD 28.50)
   🔗 Book Now

🎫 QATAR AIRWAYS AWARD AVAILABILITY

✈️ YYZ→IST (Qatar Business / Qsuite)
   📅 Jun 2027: 65,000 Avios + CAD 248.00
   🔗 Search Qatar

📋 TODAY'S BEST CASH FARES (all monitors)
   YYC→YYZ: CAD 142.50 on 2026-07-02 via Flair Airlines
   YYZ→YYC: CAD 159.00 on 2026-06-28 via WestJet

━━━━━━━━━━━━━━━━━━━━
📊 Checked 14 monitors | Found 87 quotes | 3 alerts triggered
```

---

## Architecture

```
GitHub Actions (daily cron: 11:17 UTC)
    │
    ├── npm run worker:scrape
    │     ├── RapidAPI adapter (max 10/month)
    │     ├── Google Flights Playwright (primary fallback)
    │     ├── Kayak Playwright (secondary fallback)
    │     └── Qatar Award scraper (Playwright + seats.aero)
    │           │
    │           └── ONE Telegram digest sent at end
    │
    ├── python3 predictor.py (ML price forecasts)
    │
    └── curl Vercel revalidation webhook
          │
          └── Vercel Dashboard (Next.js 14)
                ├── /           → Monitor cards + status
                ├── /awards     → Qatar award availability
                ├── /alerts     → Alert history
                └── /runs       → Scraper run logs
```

---

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| GitHub Actions (public repo) | $0 |
| Vercel Hobby | $0 |
| Supabase / Neon (free tier) | $0 |
| RapidAPI Sky Scrapper (10 calls) | $0 |
| Telegram Bot API | $0 |
| Proxies *(optional)* | ~$10–50 |
| seats.aero Partner API *(optional)* | ~$10 |
| **Total (no proxies)** | **$0/month** |

---

## Project Structure

```
flight-tracker/
├── .github/workflows/
│   └── daily-flight-check.yml   # GitHub Actions cron
├── apps/
│   ├── worker/                  # Scraper engine (Node.js / TypeScript)
│   │   └── src/
│   │       ├── adapters/        # RapidAPI, Playwright, Kayak, Qatar
│   │       ├── db/              # PostgreSQL client + schema
│   │       ├── telegram/        # Condensed digest bot
│   │       ├── scraper.ts       # Main orchestrator
│   │       └── index.ts         # Entry point
│   └── web/                     # Next.js 14 dashboard
│       ├── app/                 # App Router pages
│       ├── components/          # MonitorCard, PriceChart, etc.
│       └── lib/db.ts            # DB queries for dashboard
├── packages/
│   ├── shared/src/              # Monitors config + shared types
│   └── ml/src/predictor.py     # scikit-learn price predictor
└── .env.example
```

---

## Customizing Alert Thresholds

Edit `packages/shared/src/monitors.ts` to change `alertThreshold` per monitor:

```typescript
{
  id: "yyc-yyz-jul2-window",
  kind: "cash",
  origin: "YYC",
  destination: "YYZ",
  // ...
  alertThreshold: 160, // Alert if price drops below CAD 160
}
```

---

## Adding New Routes

Add entries to the `monitors` array in `packages/shared/src/monitors.ts`, then run `npm run db:migrate` to seed the new monitor into the database.
