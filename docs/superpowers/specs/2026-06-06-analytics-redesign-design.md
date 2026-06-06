# Analytics Tab Redesign — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Visual target:** `dashboard/public/mock-analytics.html`
**Supersedes:** the current `AnalyticsDeep.js` drill-down sub-tabs (Тело/Разум/Работа/Корреляции)

---

## 1. Context & goal

The Overview was rebuilt into a purposeful daily snapshot (readiness hero, domain cards, correlations + drivers, trends). The **Analytics** tab was never rethought — it is just "the Overview's charts, but bigger over 30 days," so it has no distinct job.

**New purpose:** Analytics becomes an **AI-driven data lab** — the place where the user's self-hosted LLM digs through their data and the user can *ask* questions in plain language, instead of operating chart controls. Auto-found statistical **findings** are the entry points; an **AI analyst** explains and advises; a shared **evidence board** visualizes whatever is being discussed.

Guiding principle (unchanged): **«инженерный флекс на базе пользы»** — data-rich, explorable, transparent (every claim cites its source and shows the evidence).

## 2. Why this shape (decisions on record)

- **Role = "lab + insights" (combo)** chosen by the user. The lab is *conversational*, not a manual chart builder.
- **The free-form "workbench" (pick any X/Y) was rejected.** Reason: it requires the user to *know how to operate it*, and it is useless/confusing in the **portfolio demo** where a passive viewer never interacts. → Hard requirement surfaced: **every tab must be valuable and self-explanatory with zero interaction** (demo-proof).
- **AI integration** chosen as the centerpiece (user's idea): a chat where the LLM receives the selected period's data and produces conclusions/advice.
- **"Обыграть график"** resolved as the **evidence board**: the chart is the AI's annotated whiteboard (highlights, callouts, swappable views), not standalone lines.
- The board must support **any metric pair** and a **correlation graph**, and be **controllable by both the user and the model**.

## 3. Information architecture (layout)

Single tab, three stacked regions (see mockup):

```
┌ Header: «AI-лаборатория · Спроси свои данные»   [7д 30д* 90д 365д ⤢свой]  n · LLM ┐
├ Findings lane — 6 auto-found findings (horizontal), click = ask AI about it       ┤
├ Body (two columns):                                                                │
│   LEFT  · AI-аналитик (chat)        │   RIGHT · Доска доказательств (evidence)     │
│   - auto-analysis opener            │   - controls: view + X↔Y pickers (AI+user)   │
│   - messages (numbers + sources)    │   - viz: correlation / timeline / weekday /  │
│   - suggested chips                 │     distribution, with AI annotations        │
│   - composer input                  │   - stat chips (r, slope, n, …)              │
└────────────────────────────────────┴──────────────────────────────────────────────┘
```

The sub-tabs (Тело/Разум/Работа/Корреляции) are removed. Period selector is global (drives findings, chat context, and board).

## 4. Components

### 4.1 Findings lane
Horizontal row of **finding cards**, each a complete micro-insight: a type tag, a one-line headline with the key number, a sub-line, and (where useful) a mini-viz. Clicking a card seeds a question into the chat **and** sets the board to that finding's evidence. Purely read-valuable (demo-friendly).

**Finding types (6):**
| Type | Example | Source/compute |
|---|---|---|
| `correlation` | «Сон → Настроение r=+0.62» | Pearson over pair (reuse `build_correlations`) |
| `threshold` | «Сон <6.5ч → продуктивность −34%» | split-at-threshold mean comparison |
| `anomaly` | «3 апр — стресс 78, ×2 нормы» | z-score / σ over window |
| `record` | «Глубокая работа — 9 дней подряд» | streak / min-max over history |
| `pattern` | «Выходные: сон +1.2ч, шаги −3100» | day-of-week / weekend grouping |
| `driver` | «Рычаг готовности — Сон +0.63» | correlation of behavioural inputs vs readiness (reuse drivers logic) |

### 4.2 AI analyst (chat)
- **Opener:** an auto-generated analysis of the selected period (key numbers, the strongest finding, anomalies), with **source chips** (Garmin/WakaTime/GitHub/Obsidian).
- **Dialogue:** the user asks in natural language; answers are grounded in the provided numbers, include figures, and cite sources. Numbers are clickable to their primary source.
- **Suggested chips:** 3–4 starter prompts (e.g. «Что улучшить на неделе?», «Объясни 3 апреля», «Сон ↔ продуктивность»).
- **Board directive:** every answer may carry an instruction that updates the board (see 4.3).

### 4.3 Evidence board (shared, controllable)
A single chart surface driven by **both the AI and the user**.
- **Controls:** a view segmented control — `correlation | timeline | weekday | distribution` — plus **X↔Y metric pickers**. A small badge shows when the AI set the current state («◇ задал AI»); the user can override at any time.
- **Views:**
  - `correlation` — scatter of X↔Y with trend line + r badge (the requested correlation graph).
  - `timeline` — metric(s) over the period with marked days / bands.
  - `weekday` — day-of-week breakdown.
  - `distribution` — histogram of a metric.
- **Annotations:** the AI can highlight points/regions and attach callouts (e.g. weekend outliers).
- **Stat chips:** context numbers for the current view (r, slope, n, threshold, …).
- Works for **any metric pair** from the available data (garmin, wakatime, github, manual.mood, schedule, readiness).

## 5. Data flow

```
collector (Python, cron)                 API (Express)                     frontend
─────────────────────────                ─────────────                     ────────
build_findings(days) ──► metrics.json    GET /api/sync ──────────────────► findings lane (render)
  meta.findings[]            meta         POST /api/analyze ──► LLM ──────► chat answer + board directive
                                            (period numbers + findings →
                                             OpenAI-compatible self-hosted LLM)
```

- **Findings** are precomputed in the collector (static, transparent) and written to `meta.findings`. The frontend renders them; clicking one is instant.
- **The chat is runtime.** A new endpoint assembles the selected period's numbers + `meta.findings` + correlations into a prompt and calls the self-hosted LLM (reuse `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL` from the existing `ai_insights`). The model returns a structured payload: `{ answer, sources[], board: { view, x, y, annotations[] } }` (JSON / tool-call output), so the board can react.
- **Demo mode:** the demo backend serves a **scripted** `/api/analyze` — a canned conversation (opener + a few question→answer→board states). The frontend code path is identical (live vs scripted differ only in the backend response source). This keeps the public demo impressive without exposing the LLM.

## 6. API & data model changes

- **`meta.findings`** (collector): array of `{ type, title, subtitle, metrics, stat, evidence: { view, x, y, annotations }, explanation, sources }`.
- **`POST /api/analyze`** (new): body `{ period, question?, focus? }` → `{ answer, sources, board }`. Guarded by the same auth as other `/api/*`. On LLM failure: graceful fallback message (no crash), board falls back to the focused finding.
- Collector: extend `metrics_calc.py` (or a new `findings.py`) with `build_findings(days)`; reuse `pearson`, `build_correlations`, readiness-driver logic. No change to how the frontend loads `metrics.json`.

## 7. Visual system

Reuse the existing design system (oklch slate palette, JetBrains Mono labels, structural cards, blueprint grid, shared `utils/charts.js`). The board charts use the unified chart language. `mock-analytics.html` is the markup/visual source of truth (temporary harness, like `mock-overview.html`).

## 8. Frontend modules (anticipated)

- `components/Findings.js` — pure builder for the findings lane from `meta.findings`.
- `components/AnalystChat.js` — chat UI; sends to `/api/analyze`, renders bubbles/chips/composer; emits board directives.
- `components/EvidenceBoard.js` — controllable board; renders the 4 views for a `{view,x,y,annotations}` state; pickers update state; accepts AI directives. Uses `utils/charts.js`.
- `main.js` — wire the three into the Analytics tab; lazy-render on first open (existing pattern).
- Demo: scripted responses provided by the demo backend (see the separate demo-mode work).

## 9. Demo-proofing (acceptance)

With **zero interaction**, the Analytics tab must read as a finished, impressive view: findings populated, the chat showing a real opener + one example exchange, the board showing an annotated correlation. Interaction (asking, switching the board) is enrichment, not a prerequisite.

## 10. Out of scope / deferred

- Free-form "build any chart" workbench (explicitly rejected).
- Goal/experiment tracking and periodic "wrapped" reports (other rejected options; may return later).
- Real-time streaming of LLM tokens (nice-to-have; v1 can be request/response).
- Persisting chat history across sessions.

## 11. Open questions (resolve during planning)

- Exact `build_findings` thresholds (anomaly σ, threshold split point) — tune on real data.
- LLM structured-output mechanism (JSON mode vs tool-call) for the board directive.
- How the demo's scripted conversation is authored/stored (static JSON vs in the demo backend).
