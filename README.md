# ✈ Flight Price Tracker

Daily automated flight price monitoring with Telegram alerts and a static dashboard.

**No browser. No Docker. No database. Pure HTTP.**

Structured after the [law-associate-job-alerts](https://github.com/) pattern:
single `main.py`, `results.json` committed back to the repo after every run,
static `index.html` dashboard served directly from the repo.

---

## Why this works where previous versions failed

Previous versions used Playwright (browser automation) which requires installing
system libraries via `apt-get`. Ubuntu 24.04 renamed `libasound2` → `libasound2t64`,
and GitHub retired the `ubuntu-22.04` runner label (it now silently provisions 24.04).
Every attempt to pin the OS or patch the dependency list broke on the next run.

This version uses **only `requests`** — no browser, no apt packages, no OS-level
dependencies. The `libasound2` error is structurally impossible here.

---

## Monitored Routes

### Cash Fares
| Monitor | Route | Window | Alert below |
|---|---|---|---|
| `yyc-yyz-jul2-window` | YYC→YYZ | Jun 28–Jul 6, 2026 | CAD 180 |
| `yyc-yyz-jul13-window` | YYC→YYZ | Jul 9–17, 2026 | CAD 180 |
| `yyc-yyz-jul14-window` | YYC→YYZ | Jul 10–18, 2026 | CAD 180 |
| `yyz-yyc-june-last-week` | YYZ→YYC | Jun 24–30, 2026 | CAD 180 |
| `yyz-yyc-may8-window` | YYZ→YYC | May 3–13, 2026 | CAD 160 |
| `yyz-yyc-jun10` | YYZ→YYC | Jun 8–12, 2026 | CAD 180 |
| `yyc-yyz-jun13` | YYC→YYZ | Jun 11–15, 2026 | CAD 180 |

### Qatar Awards (Business Class · Privilege Club)
| Monitor | Route | Month |
|---|---|---|
| `qatar-award-yyz-isb-jun2027` | YYZ→ISB | June 2027 |
| `qatar-award-yyz-isb-jul2027` | YYZ→ISB | July 2027 |
| `qatar-award-yyz-isb-dec2027` | YYZ→ISB | Dec 2027 |
| `qatar-award-yyz-ist-jun2027` | YYZ→IST | June 2027 |
| `qatar-award-yyz-ist-jul2027` | YYZ→IST | July 2027 |
| `qatar-award-yyz-ist-dec2027` | YYZ→IST | Dec 2027 |

---

## File Structure

```
flight-tracker/
├── main.py                              ← single scraper entry point
├── requirements.txt                     ← requests, beautifulsoup4, python-telegram-bot
├── results.json                         ← all data; committed back by CI each run
├── history.json                         ← seen URL cache (GitHub Actions cache)
├── index.html                           ← static parchment/gold dashboard
├── .env.example                         ← copy to .env for local dev
├── README.md
└── .github/
    └── workflows/
        └── daily-flight-check.yml       ← runs at 11:17 UTC, commits results.json back
```

---

## Setup

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/flight-tracker.git
cd flight-tracker
cp .env.example .env
# fill in your keys
```

### 2. Create a Telegram Bot

1. Message **@BotFather** → `/newbot` → save the token
2. Start a chat with your bot, then visit:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   Find `"chat": {"id": 123456789}` — that's your Chat ID

### 3. Get API keys

| Key | Where | Cost |
|-----|-------|------|
| `RAPIDAPI_KEY` | [rapidapi.com/apiheya/api/sky-scrapper](https://rapidapi.com/apiheya/api/sky-scrapper) | Free tier (capped at 10/month by tracker) |
| `AMADEUS_CLIENT_ID` + `SECRET` | [developers.amadeus.com/register](https://developers.amadeus.com/register) | Free — 2000 calls/month |
| `SEATS_AERO_API_KEY` | [seats.aero/partnerapi](https://seats.aero/partnerapi) | ~$10/month (optional) |

### 4. Add GitHub Secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Required |
|--------|----------|
| `TELEGRAM_BOT_TOKEN` | ✅ |
| `TELEGRAM_CHAT_ID` | ✅ |
| `RAPIDAPI_KEY` | Recommended |
| `AMADEUS_CLIENT_ID` | Recommended |
| `AMADEUS_CLIENT_SECRET` | Recommended |
| `SEATS_AERO_API_KEY` | Optional |
| `DASHBOARD_URL` | Optional (shown in alerts) |

### 5. Deploy the dashboard

The `index.html` reads `results.json` from the same directory.

**Option A — GitHub Pages (free, zero config):**
Settings → Pages → Source: `main` branch, `/ (root)` → Save.
Dashboard URL: `https://YOUR_USERNAME.github.io/flight-tracker/`

**Option B — Vercel:**
Import the repo → Framework: Other → Root directory: `/` → Deploy.

Set `DASHBOARD_URL` secret to whichever URL you use.

### 6. Test

```bash
pip install -r requirements.txt
python main.py
```

Or trigger manually: Actions → Daily Flight Price Check → Run workflow.

---

## How results.json is updated

The workflow:
1. Checks out the repo
2. Restores `history.json` from GitHub Actions cache
3. Runs `main.py` → writes `results.json`
4. Saves updated `history.json` to cache
5. **Commits `results.json` back to the repo** (`git push`)
6. The dashboard `index.html` reads the newly committed `results.json`

This is identical to the pattern used by the law-associate-job-alerts repo.
