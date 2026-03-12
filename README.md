# ✈️ Flight Tracker

Automated daily flight price monitoring with Telegram alerts and a Vercel dashboard.

## What It Does

- **Checks flights every day** at 11:17 UTC via GitHub Actions
- **Cash fares** (YYC↔YYZ) scraped via Google Flights (Playwright) + RapidAPI supplement
- **Qatar award availability** via Seats.aero API or direct Privilege Club scraping
- **One Telegram message per run** — all alerts condensed into a single notification
- **Dashboard** — deployed to Vercel, shows price history and monitor status

---

## Monitored Routes

### Cash Fares (Google Flights)
| Monitor | Route | Dates |
|---------|-------|-------|
| `yyc-yyz-jul2-window` | YYC → YYZ | Jun 28 – Jul 6, 2026 |
| `yyc-yyz-jul13-window` | YYC → YYZ | Jul 9 – Jul 17, 2026 |
| `yyc-yyz-jul14-window` | YYC → YYZ | Jul 10 – Jul 18, 2026 |
| `yyz-yyc-june-last-week` | YYZ → YYC | Jun 24 – Jun 30, 2026 |
| `yyz-yyc-may8-window` | YYZ → YYC | May 3 – May 13, 2026 |
| `yyz-yyc-june10` | YYZ → YYC | Jun 10, 2026 |
| `yyc-yyz-june13` | YYC → YYZ | Jun 13, 2026 |

### Qatar Awards (Business Class, Avios)
| Route | Months |
|-------|--------|
| YYZ → ISB (Islamabad) | Jun 2027, Jul 2027, Dec 2027 |
| YYZ → IST (Istanbul) | Jun 2027, Jul 2027, Dec 2027 |
| YYZ → SAW (Istanbul Sabiha) | Jun 2027, Jul 2027, Dec 2027 |

---

## Setup

### 1. Database

Create a free PostgreSQL database (recommended: [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Vercel Postgres](https://vercel.com/storage/postgres)).

Run the schema:
```sql
-- Copy and run packages/shared/src/schema.sql in your DB
```

### 2. Telegram Bot

1. Message `@BotFather` → `/newbot` → save the token
2. Start a chat with your bot
3. Get your Chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates`

### 3. RapidAPI (Optional)

1. Sign up at [rapidapi.com](https://rapidapi.com)
2. Subscribe to **"Sky Scrapper"** API (free tier available)
3. Copy your API key

> ⚠️ RapidAPI usage is **limited to 10 calls/month** to stay within free tier. The tracker falls back to Playwright scraping automatically when the limit is reached.

### 4. Seats.aero (Optional but Recommended for Awards)

Subscribe at [seats.aero](https://seats.aero) for reliable Qatar award data. Without this key, the tracker scrapes Qatar's Privilege Club site directly.

### 5. GitHub Secrets

In your repo → Settings → Secrets and variables → Actions → New secret:

| Secret | Required | Description |
|--------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | Your personal chat ID |
| `RAPIDAPI_KEY` | Optional | Sky Scrapper API key |
| `SEATS_AERO_API_KEY` | Optional | Seats.aero subscription key |

### 6. Vercel Deployment

1. Go to [vercel.com](https://vercel.com) → Import Project → select this repo
2. **Root Directory**: `apps/web`
3. **Framework**: Next.js
4. Add environment variable: `DATABASE_URL`
5. Deploy

---

## Local Development

```bash
# Clone
git clone https://github.com/yourusername/Flight-Tracker.git
cd Flight-Tracker

# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Edit .env with your real values

# Run the scraper once
npm run worker:scrape

# Start the dashboard
npm run web:dev
```

---

## Architecture

```
Flight-Tracker/
├── .github/workflows/
│   └── daily-flight-check.yml    # GitHub Actions cron
├── apps/
│   ├── worker/                    # Scraper engine
│   │   └── src/
│   │       ├── adapters/
│   │       │   ├── base.ts                        # Interface + helpers
│   │       │   ├── google-flights-playwright.ts   # Primary cash scraper
│   │       │   ├── rapidapi-flights.ts            # Supplemental API (10/mo)
│   │       │   └── qatar-award.ts                 # Award availability
│   │       ├── db/client.ts       # PostgreSQL queries
│   │       ├── telegram/bot.ts    # Consolidated Telegram alerts
│   │       └── index.ts           # Main orchestrator
│   └── web/                       # Next.js dashboard
│       ├── app/
│       │   ├── page.tsx           # Dashboard home
│       │   ├── history/[id]/      # Price history charts
│       │   ├── runs/              # Run logs
│       │   └── alerts/            # Alert history
│       └── components/
│           ├── MonitorCard.tsx
│           └── PriceChart.tsx
└── packages/shared/               # Shared types + monitor configs
    └── src/
        ├── monitors.ts            # All monitor definitions
        ├── types.ts               # TypeScript types
        └── schema.sql             # Database schema
```

## Alert Logic

A single Telegram message is sent per daily run containing:

- 🏆 **New all-time low** — cheapest price ever recorded
- 📉 **Price drop ≥ 12%** — significant drop since last check
- 🎯 **Under CAD $160** — below absolute threshold
- 🎫 **Award availability** — new Qatar business seats found

If there are no deals, no message is sent (no spam).

---

## Cost

| Service | Monthly Cost |
|---------|-------------|
| GitHub Actions (public repo) | $0 |
| Vercel Hobby | $0 |
| PostgreSQL (Neon free tier) | $0 |
| Telegram Bot API | $0 |
| RapidAPI (≤10 calls/mo) | $0 |
| Seats.aero (optional) | ~$10 |
| **Total** | **$0–10/mo** |
