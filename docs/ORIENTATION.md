# Life Dashboard — Repo Orientation & Runbook

Read this first. It explains the architecture, how to run everything locally, the
data flow, env vars, and auth. Then read the redesign docs:
- Design spec: `docs/superpowers/specs/2026-06-04-dashboard-content-redesign-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-04-dashboard-content-redesign.md`
- Analytics spec: `docs/superpowers/specs/2026-06-06-analytics-redesign-design.md`
- Infrastructure spec: `docs/superpowers/specs/2026-06-06-infrastructure-redesign-design.md`
- Visual targets (do NOT delete until demo-mode work consumes/retires them):
  `dashboard/public/mock-overview.html`, `dashboard/public/mock-analytics.html`,
  `dashboard/public/mock-infrastructure.html`

---

## 1. What this is

A personal "life dashboard": health (Garmin), dev activity (Git/GitHub), weather,
Obsidian-based mood/schedule, and self-hosted infra — aggregated into one UI that
also embeds a few apps (LibreChat, Guacamole/RDP, OmniRoute). It is a portfolio piece:
the goal is "engineering flex on a genuinely useful tool".

## 2. Architecture (3 services + a shared JSON file)

```
                 writes                      reads/writes
  collector ───────────────►  data/metrics.json  ◄───────────────  api (Express :3001)
  (Python, cron /2h)                  ▲                                   │ serves /api/*, socket.io
                                      │ reads                             │
                                      └───────────────────────────  dashboard (Vite build → nginx :80)
                                          via  GET /api/sync          nginx proxies /api/ and /socket.io/ → api:3001
```

- **`collector/`** — Python 3.12, runs `run_collect.py` on cron **every 2 hours** (busybox `crond`, see `collector/entrypoint.sh`) plus once on startup. Fetches Garmin, Open-Meteo weather, Git commits, and Obsidian schedules for **yesterday+today**, merges them into `metrics.json`. Sources live in `collector/sources/*.py`; each `collect_X(metrics, dates)` function in `run_collect.py` attaches a key to the per-day object.
- **`api/`** — Node 22, Express on **:3001** (`api/server.js`). Reads/writes the **same** `metrics.json`. Key endpoints:
  - `GET /api/sync` — overlays Obsidian daily-note frontmatter (mood/food) onto `metrics.json`, saves, returns the **full metrics object**. **This is the dashboard's primary data source.**
  - `GET /api/metrics` — returns `metrics.json` without syncing.
  - `GET/POST /api/entry` — read/write today's mood/food/note (QuickEntry) → also writes the Obsidian daily note.
  - `GET/POST /api/schedule` — parse/write the day's schedule from Obsidian markdown tables.
  - `GET /api/forecast` — Open-Meteo 7-day + hourly + current (weather widget). Returns emoji icon codes (the frontend maps them to SVG in `utils/icons.js`).
  - `GET /api/metrics/server` — legacy Netdata + Docker container stats endpoint, still kept for compatibility.
  - `POST /api/analyze` — Analytics AI lab endpoint. Builds a grounded prompt from the selected period, `meta.findings`, correlations, and current metrics; calls an OpenAI-compatible LLM when configured; otherwise returns a graceful fallback `{answer, sources, board}`.
  - `GET /api/infra/topology` — Homelab cockpit topology. Combines Docker networks/containers, Netdata host telemetry, nginx proxy routes, and Guacamole connections; returns an empty/fallback topology instead of throwing when any source is unavailable.
  - `POST /api/login`, `GET /api/auth-check` — cookie auth.
  - **socket.io:** emits `docker_pulse` (container states) and `agent_pulse` (active agent from OpenClaw logs). Requires the host Docker socket and a reachable Netdata.
- **`dashboard/`** — Vite + **vanilla JS ES modules** + Chart.js + socket.io-client. Built to static files, served by **nginx** (`dashboard/nginx.conf`) which proxies `/api/` and `/socket.io/` to `life-dashboard-api:3001` and does SPA fallback. Entry: `dashboard/src/main.js`; components in `dashboard/src/components/*`; data access in `dashboard/src/utils/dataLoader.js` (`loadMetrics` tries `/api/sync`, then `/data/metrics.json`, then `/metrics.json`).

**Deploy:** GitHub Actions (`.github/workflows/docker-publish.yml`) builds & pushes 3 images to `ghcr.io/<owner>/life-dashboard-{frontend,api,collector}:latest` on push to `main`/`master`. There is **no committed docker-compose** here; the server pulls these images. A shared volume holds `metrics.json` (collector writes, api reads/writes); the vault and git repos are bind-mounted into the collector/api.

## 3. Data model: the `metrics.json` file

```jsonc
{
  "days": {
    "2026-06-04": {
      "date": "2026-06-04", "weekday": "Чт", "week_iso": "2026-W23",
      "manual":   { "mood": 4, "food_before_20": true, "note": "" },   // from Obsidian / /api/entry
      "garmin":   { "sleep_hours": 7.4, "sleep_score": 78, "sleep_phases": {...},
                    "body_battery_max": 71, "body_battery_min": 18, "steps": 8870,
                    "stress_avg": 34, "resting_hr": 54, "spo2_avg": 96, "spo2_low": 90 },
      "git":      { "commits": 16, "repos": ["life-dashboard"] },
      "weather":  { ... },                                              // daily (separate from /api/forecast)
      "schedule": { "wake_time": "06:30", "hours_work": 5.0, "hours_projects": 2.0, ... }
      // ── added by the redesign plan ──
      // "wakatime": { "total_h": 4.8, "by_language": {...}, "by_project": {...}, "focus_h": 4.1 },
      // "github":   { "prs_merged": 3, "reviews": 5, "streak": 23, "langs": {}, "additions": 1240, "deletions": 380 },
      // "readiness":{ "score": 76, "sleep": 82, "energy": 71, "calm": 66, "hrv": 58 }
    }
  },
  "meta": {
    "last_updated": "...", "correlations": {...}, "ai_brief": {...}, "now": {...},
    "findings": [
      { "type": "correlation", "title": "...", "evidence": { "view": "correlation", "x": "Сон", "y": "Наст" } }
    ]
  }
}
```

**Where derived values are computed (redesign):** the **collector** computes `day.readiness`,
`meta.correlations`, `meta.findings`, and `meta.ai_brief` and writes them into `metrics.json`. The API's
`/api/sync` only updates `manual.*` and preserves the rest, so they reach the frontend
unchanged. **Caveat:** correlations/brief refresh on the collector's 2-hour run, not on
mood edits. If you need instant recompute, port `collector/metrics_calc.py` to a small JS
module and call it inside `syncFromVault` in `api/server.js`.

## 4. Run it locally (no Docker)

Prereqs: Node 22+, Python 3.12+, npm, pip.

**API (:3001):**
```bash
cd api && npm install
DASHBOARD_PASS=dev \
VAULT_PATH=/path/to/obsidian-vault \
METRICS_PATH="$(pwd)/../data/metrics.json" \
npm start
```
(With `DASHBOARD_PASS` unset, auth is open. `/api/metrics/server` and socket pulses need
Docker/Netdata and will simply degrade if absent.)

**Frontend (:5173, real backend):**
```bash
cd dashboard && npm install && npm run dev
# vite.config.js proxies /api → http://localhost:3001
```

**Frontend (:5174, MOCK backend — no API/data needed, for UI/design work):**
```bash
cd dashboard && npm install
npx vite --config vite.mock.config.js --port 5174
# vite.mock.config.js stubs /api/auth-check, /api/sync, /api/forecast, /api/schedule with fake data.
# It also stubs /api/analyze, meta.findings, and /api/infra/topology for the AI lab + homelab cockpit.
# This is the server used to preview the redesign mockups (mock-overview.html etc).
```

**Collector (writes metrics.json once):**
```bash
cd collector && pip install -r requirements.txt
GARMIN_EMAIL=... GARMIN_PASSWORD=... \
VAULT_PATH=/path/to/vault GIT_REPOS_PATH=/path/to/repos \
METRICS_PATH="$(pwd)/../data/metrics.json" \
python run_collect.py
```

**Tests (added by the plan):**
```bash
cd dashboard && npm test          # vitest (frontend pure logic)
cd collector && python -m pytest  # pytest (collectors + metrics_calc)
```

## 5. Auth model

Cookie `dashboard_session = HMAC_SHA256(SESSION_SECRET, DASHBOARD_PASS)`.
`POST /api/login` sets it; `GET /api/auth-check` validates it; all `/api/*` (except
login/auth-check) and socket.io handshakes require it. If `DASHBOARD_PASS` is empty,
everything is open (dev mode). The frontend shows a login modal when `/api/auth-check` 401s.

## 6. Environment variables

| Var | Used by | Purpose |
|---|---|---|
| `GARMIN_EMAIL`, `GARMIN_PASSWORD` | collector | Garmin Connect login |
| `VAULT_PATH` | collector, api | Obsidian vault root (daily notes, schedules) |
| `GIT_REPOS_PATH` | collector | dir scanned for `.git` repos |
| `WEATHER_LAT`, `WEATHER_LON` | collector | weather location |
| `METRICS_PATH` | collector, api | path to `metrics.json` (collector default `/data/metrics.json`) |
| `DASHBOARD_PASS` | api | dashboard password (empty = open) |
| `PORT` | api | API port (default 3001) |
| `NETDATA_URL` | api | Netdata base URL for server metrics and topology telemetry |
| `NGINX_CONF_PATH` | api | optional nginx config parsed into public host → upstream routes |
| `GUAC_URL`, `GUAC_USER`, `GUAC_PASS` | api | optional Guacamole REST credentials for VM connection nodes |
| **`WAKATIME_API_KEY`** | collector | **(redesign)** coding stats |
| **`GITHUB_TOKEN`, `GITHUB_USER`** | collector | **(redesign)** PRs/reviews/streak |
| **`CI_REPOS`** | collector | **(redesign, optional)** comma-separated GitHub Actions repos (`owner/repo`) |
| **`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`** | collector, api | **(redesign)** AI daily brief and `/api/analyze` (OpenAI-compatible self-hosted LLM) |

See `.env.example` for the canonical list.

## 7. Visual system (already implemented — Phase 0)

The palette/typography redesign is done: cool near-black slate base, green accent aligned
with the portfolio (`oklch(58% .16 145)`), JetBrains Mono labels, blueprint-grid background,
SVG line icons (`utils/icons.js`), Chart.js palette/mono (`utils/palette.js`), structural
cards. The content redesign builds on top of that: Analytics is now an AI lab
(`Findings`, `AnalystChat`, `EvidenceBoard`) instead of `AnalyticsDeep`, and
Infrastructure is now a homelab cockpit (`HostVitals`, `LiveTelemetry`, `StackTopology`)
instead of `ServerMetrics`. Do not revert these replacements.

## 8. Gotchas

- The collector only processes **yesterday + today**; historical days already in
  `metrics.json` are preserved. Readiness should be (re)computed for all days; correlations
  use the trailing window (last 30).
- `git` data uses `repos[]`; `github` (PRs/reviews) is a **separate** key added by the plan.
- Weather appears twice: `day.weather` (collector, daily, unused by the widget) and
  `/api/forecast` (live, what the widget renders).
- Chart.js charts created while their tab is `display:none` render at 0 size — render them
  lazily on first tab open (see `ensureAnalytics()` and `ensureInfra()` in `main.js`).
- Design/preview harness, **kept intentionally** (not shipped — `public/` is dev-served, and
  the mock config is only used by `--config vite.mock.config.js`): `dashboard/vite.mock.config.js`
  (offline mock backend on :5174), `.claude/launch.json` (Claude Preview `dashboard-mock`),
  `dashboard/public/mock-overview.html`, `dashboard/public/mock-analytics.html`, and
  `dashboard/public/mock-infrastructure.html` (visual sources-of-truth). Launch with
  `npx vite --config vite.mock.config.js --port 5174`, then open `/` (app) and the relevant
  `/mock-*.html` target. `mock-approaches.html` (early direction sketches) was removed — no longer needed.
