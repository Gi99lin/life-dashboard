# Analytics + Infrastructure Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild two tabs into purposeful, demo-proof surfaces: **Analytics** → an AI-driven data lab (auto-found findings + an LLM analyst + a shared evidence board), and **Infrastructure** → a homelab cockpit (host vitals + a big live telemetry chart + a living stack topology parsed from the real infra).

**Architecture:** Derived data (findings) is computed in the Python **collector** and written to `metrics.json`. Interactive/aggregating endpoints live in the **Express API** (`/api/analyze` for the LLM analyst, `/api/infra/topology` for the stack graph). The **vanilla-JS frontend** renders modular components that return HTML/SVG strings (pure builders → unit-testable) plus thin DOM wrappers; charts use the shared `dashboard/src/utils/charts.js`. The offline mock (`dashboard/vite.mock.config.js`) stubs both new endpoints so the tabs render in preview and the future demo.

**Tech Stack:** Vite + vanilla JS ES modules + Chart.js (frontend); Express 5 + socket.io + dockerode (API); Python 3.12 + requests (collector). Tests: **vitest** (frontend/API pure logic) and **pytest** (collector).

**Reference specs:** `docs/superpowers/specs/2026-06-06-analytics-redesign-design.md`, `docs/superpowers/specs/2026-06-06-infrastructure-redesign-design.md`
**Visual targets (exact markup/look):** `dashboard/public/mock-analytics.html`, `dashboard/public/mock-infrastructure.html`

---

## Conventions for the implementing engineer

- **Read before writing.** For each "Modify" file, open it and follow existing patterns. Key references: `collector/run_collect.py` (how day objects + `meta` are assembled), `collector/metrics_calc.py` (pure `pearson`/`build_correlations`), `collector/ai_insights.py` (LLM call + env), `api/server.js` (Express routes, auth, dockerode `pollDocker`, Netdata proxy), `dashboard/src/utils/charts.js` (`lineSeries/barSeries/lineOptions/barOptions/gradientFill`), `dashboard/src/utils/dataLoader.js` (`getDays`), `dashboard/src/components/CorrelationPanel.js` + `readinessDrivers.js` (pure-builder + Pearson patterns), `dashboard/src/main.js` (lazy-render on tab open via `ensureAnalytics`/`ensureServerMetrics`).
- **Match the mock for markup.** `mock-analytics.html` and `mock-infrastructure.html` are the authoritative DOM + CSS. Components reproduce that markup from real data; CSS classes already exist there to copy into `main.css`.
- **Colors:** use CSS vars in CSS; in JS/Chart.js use `PAL` from `utils/palette.js` (green `#59be6c`, aqua `#5dc0a7`, blue `#69aed5`, yellow `#e2c162`, orange `#e99355`, purple `#c88ec3`, red `#e3645e`, fg `#eaeff3`, fg-dim `#a3acb3`, fg-muted `#727c84`).
- **Graceful degradation:** every source (LLM, Docker, Netdata, nginx file, Guacamole) may be unavailable — never crash; return empty/fallback.
- **Commit after every task** with the shown message. Branch off the default branch first; do not commit to the default branch. (Current working branch already exists: `codex/dashboard-content-redesign-phase-1`.)
- **Run from repo root** unless a command `cd`s. Test commands: collector `cd collector && python -m pytest`; frontend `cd dashboard && npm test`; API `cd api && npm test`; build `cd dashboard && npm run build`.

## File structure (created / modified)

**PART A — Analytics**
- Create `collector/findings.py` — pure `build_findings(days)` → list of typed findings.
- Create `collector/tests/test_findings.py`.
- Modify `collector/run_collect.py` — attach `meta.findings`.
- Create `api/analyze.js` — pure prompt assembly + board-directive parse.
- Create `api/test/analyze.test.js`.
- Modify `api/server.js` — add `POST /api/analyze`.
- Create `dashboard/src/components/Findings.js` — findings lane builder.
- Create `dashboard/src/components/EvidenceBoard.js` — 4 board views + controls.
- Create `dashboard/src/components/AnalystChat.js` — chat UI + `/api/analyze` calls.
- Create `dashboard/test/{findings,evidenceBoard}.test.js`.
- Modify `dashboard/index.html` (Analytics tab markup), `dashboard/src/main.js` (wire), `dashboard/src/styles/main.css` (append styles from mock-analytics.html), `dashboard/vite.mock.config.js` (stub `/api/analyze` + `meta.findings`).
- Delete `dashboard/src/components/AnalyticsDeep.js` (+ its tests) once replaced.

**PART B — Infrastructure**
- Create `api/nginxRoutes.js` — pure parser: nginx config → routes/urls.
- Create `api/guacamole.js` — read Guacamole connections (VMs).
- Create `api/infraTopology.js` — assemble the topology payload.
- Create `api/test/{nginxRoutes,infraTopology}.test.js`.
- Modify `api/server.js` — add `GET /api/infra/topology`.
- Create `dashboard/src/components/{HostVitals,LiveTelemetry,StackTopology}.js`.
- Create `dashboard/test/stackTopology.test.js`.
- Modify `dashboard/index.html` (Infrastructure tab markup), `dashboard/src/main.js` (wire), `dashboard/src/styles/main.css` (append styles from mock-infrastructure.html), `dashboard/vite.mock.config.js` (stub `/api/infra/topology`).
- Delete `dashboard/src/components/ServerMetrics.js` once replaced.

---
---

# PART A — ANALYTICS (AI DATA LAB)

## Phase A1 — Findings computation (collector, pure)

**Outcome:** `meta.findings` is computed each collector run: a list of typed findings (correlation, threshold, anomaly, record, pattern, driver) the lane renders and the analyst cites.

### Task A1.1: `build_findings` pure module

**Files:**
- Create: `collector/findings.py`
- Test: `collector/tests/test_findings.py`

- [ ] **Step 1: Write the failing tests**

`collector/tests/test_findings.py`:
```python
from collector.findings import build_findings

def _days(n=30):
    days = []
    for i in range(n):
        days.append({
            "date": f"2026-05-{i+1:02d}",
            "manual": {"mood": 3 + (i % 3)},
            "garmin": {"sleep_hours": 6.0 + (i % 4) * 0.5, "stress_avg": 40 - (i % 5),
                        "steps": 6000 + (i % 6) * 700, "resting_hr": 55,
                        "sleep_score": 70, "body_battery_max": 65},
            "wakatime": {"total_h": (i % 5) * 1.0},
            "git": {"commits": i % 4},
            "readiness": {"score": 60 + (i % 7) * 4},
        })
    return days

def test_returns_typed_findings_list():
    out = build_findings(_days())
    assert isinstance(out, list) and out
    types = {f["type"] for f in out}
    assert types <= {"correlation", "threshold", "anomaly", "record", "pattern", "driver"}
    for f in out:
        assert {"type", "title", "evidence", "sources"} <= set(f)
        assert {"view", "x", "y"} <= set(f["evidence"])

def test_anomaly_flags_outlier_day():
    days = _days()
    days[20]["garmin"]["stress_avg"] = 95  # spike
    out = build_findings(days)
    anomalies = [f for f in out if f["type"] == "anomaly"]
    assert any("2026-05-21" in (f.get("subtitle", "") + f["title"]) or
               f.get("evidence", {}).get("annotations") for f in anomalies)

def test_empty_input_is_safe():
    assert build_findings([]) == []
```

- [ ] **Step 2: Run to verify failure**

Run: `cd collector && python -m pytest tests/test_findings.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`collector/findings.py`:
```python
"""Auto-found statistical findings for the Analytics lab.

Each finding: {type, title, subtitle, metrics, stat, evidence, explanation, sources}
- evidence drives the board: {view, x, y, annotations?}  (view in
  correlation|timeline|weekday|distribution)
Reuses pearson from metrics_calc; pure (no I/O)."""
from statistics import mean, pstdev
from collections import defaultdict

from metrics_calc import pearson  # collector/ is on sys.path in run_collect

# (label, extractor). Mirrors CORR_METRICS but includes behavioural inputs.
_M = {
    "Сон":  lambda d: (d.get("garmin") or {}).get("sleep_hours"),
    "Наст": lambda d: (d.get("manual") or {}).get("mood"),
    "Стр":  lambda d: (d.get("garmin") or {}).get("stress_avg"),
    "Шаг":  lambda d: (d.get("garmin") or {}).get("steps"),
    "Код":  lambda d: (d.get("wakatime") or {}).get("total_h"),
    "Готов": lambda d: (d.get("readiness") or {}).get("score"),
}
_SRC = {"garmin": "Garmin", "wakatime": "WakaTime", "github": "GitHub",
        "git": "GitHub", "manual": "Obsidian"}


def _sources(day):
    return sorted({label for key, label in _SRC.items() if (day or {}).get(key)})


def _col(days, label):
    fn = _M[label]
    return [fn(d) for d in days]


def _f(type_, title, view, x, y, **kw):
    f = {"type": type_, "title": title, "subtitle": kw.get("subtitle", ""),
         "metrics": [x, y] if y else [x], "stat": kw.get("stat"),
         "evidence": {"view": view, "x": x, "y": y, "annotations": kw.get("annotations", [])},
         "explanation": kw.get("explanation", ""), "sources": kw.get("sources", [])}
    return f


def _correlations(days):
    out = []
    labels = list(_M)
    for i, a in enumerate(labels):
        for b in labels[i + 1:]:
            r = pearson(_col(days, a), _col(days, b))
            if r is None or abs(r) < 0.4:
                continue
            out.append(_f("correlation", f"{a} ↔ {b} · r={r:+.2f}", "correlation", a, b,
                          stat=r, subtitle=f"|r|={abs(r):.2f}",
                          explanation=f"{a} и {b} связаны (r={r:+.2f}).",
                          sources=_sources(days[-1])))
    out.sort(key=lambda f: -abs(f["stat"]))
    return out[:2]


def _drivers(days):
    rs = []
    for label in ("Сон", "Шаг", "Код", "Наст"):
        r = pearson(_col(days, label), _col(days, "Готов"))
        if r is not None:
            rs.append((label, r))
    if not rs:
        return []
    rs.sort(key=lambda t: -abs(t[1]))
    label, r = rs[0]
    return [_f("driver", f"Рычаг готовности — {label} ({r:+.2f})", "correlation", label, "Готов",
               stat=r, subtitle="сильнее всех", sources=_sources(days[-1]))]


def _anomalies(days):
    vals = [(d, (d.get("garmin") or {}).get("stress_avg")) for d in days]
    nums = [v for _, v in vals if v is not None]
    if len(nums) < 5:
        return []
    mu, sd = mean(nums), pstdev(nums)
    if sd == 0:
        return []
    out = []
    for d, v in vals:
        if v is None:
            continue
        z = (v - mu) / sd
        if z >= 2.0:
            out.append(_f("anomaly", f"{d['date']} — стресс {v}, ×{v/mu:.1f} нормы",
                          "timeline", "Стр", None, subtitle=f"σ +{z:.1f}",
                          annotations=[{"date": d["date"], "label": "аномалия"}],
                          sources=_sources(d)))
    return out[:1]


def _records(days):
    streak = best = 0
    for d in days:
        commits = (d.get("git") or {}).get("commits") or 0
        streak = streak + 1 if commits > 0 else 0
        best = max(best, streak)
    if best < 3:
        return []
    return [_f("record", f"Стрик коммитов — {best} дней подряд", "timeline", "Код", None,
               stat=best, subtitle="текущий рекорд", sources=_sources(days[-1]))]


def _patterns(days):
    by_wd = defaultdict(list)
    for d in days:
        sh = (d.get("garmin") or {}).get("sleep_hours")
        wd = d.get("weekday")
        if sh is not None and wd:
            by_wd[wd].append(sh)
    if len(by_wd) < 5:
        return []
    weekend = [v for wd in ("Сб", "Вс") for v in by_wd.get(wd, [])]
    week = [v for wd in ("Пн", "Вт", "Ср", "Чт", "Пт") for v in by_wd.get(wd, [])]
    if not weekend or not week:
        return []
    diff = mean(weekend) - mean(week)
    if abs(diff) < 0.5:
        return []
    return [_f("pattern", f"Выходные: сон {diff:+.1f}ч", "weekday", "Сон", None,
               stat=round(diff, 1), subtitle="по дням недели", sources=_sources(days[-1]))]


def _thresholds(days):
    lo, hi = [], []
    for d in days:
        sh = (d.get("garmin") or {}).get("sleep_hours")
        work = (d.get("wakatime") or {}).get("total_h")
        if sh is None or work is None:
            continue
        (lo if sh < 6.5 else hi).append(work)
    if len(lo) < 3 or len(hi) < 3:
        return []
    a, b = mean(hi), mean(lo)
    if a == 0:
        return []
    pct = round((b - a) / a * 100)
    return [_f("threshold", f"Сон <6.5ч → код {pct:+d}%", "distribution", "Сон", "Код",
               stat=pct, subtitle=f"≥6.5ч: {a:.1f}ч · <6.5ч: {b:.1f}ч", sources=_sources(days[-1]))]


def build_findings(days):
    if not days:
        return []
    out = []
    out += _correlations(days)
    out += _thresholds(days)
    out += _anomalies(days)
    out += _records(days)
    out += _patterns(days)
    out += _drivers(days)
    return out
```

- [ ] **Step 4: Run to verify pass**

Run: `cd collector && python -m pytest tests/test_findings.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add collector/findings.py collector/tests/test_findings.py
git commit -m "feat(collector): build_findings for the analytics lab"
```

### Task A1.2: Wire findings into `run_collect.py`

**Files:** Modify `collector/run_collect.py`

- [ ] **Step 1:** Open `collector/run_collect.py`. It already imports from `metrics_calc` and has `attach_derived_metrics(metrics)` (computes readiness + correlations) called in `main()` before `save_metrics`.

- [ ] **Step 2:** Add a function near `attach_derived_metrics`:
```python
def attach_findings(metrics):
    """Compute meta.findings from the trailing window."""
    days = metrics.setdefault("days", {})
    ordered = [days[k] for k in sorted(days)]
    try:
        from findings import build_findings
        metrics.setdefault("meta", {})["findings"] = build_findings(ordered[-30:])
    except Exception as e:
        metrics.setdefault("meta", {})["findings"] = []
        print(f"  Findings error: {e}")
```

- [ ] **Step 3:** In `main()`, call it right after `attach_derived_metrics(metrics)` (correlations must exist first is not required, but readiness scores are used by drivers):
```python
    attach_derived_metrics(metrics)
    attach_findings(metrics)
    attach_ai_brief(metrics)
```

- [ ] **Step 4:** Run the collector end-to-end with no network keys (sources skip) against a temp metrics file and confirm `meta.findings` is a non-empty list when ≥5 days exist.

Run: `cd collector && METRICS_PATH=/tmp/m.json GIT_REPOS_PATH=/nonexistent VAULT_PATH=/nonexistent python run_collect.py; python -c "import json;print(len(json.load(open('/tmp/m.json'))['meta'].get('findings',[])))"`
Expected: prints a number (0 if <5 days; that's fine on first run — seed by running twice or against existing data).

- [ ] **Step 5: Commit**

```bash
git add collector/run_collect.py
git commit -m "feat(collector): attach meta.findings"
```

## Phase A2 — AI analyst endpoint (API)

**Outcome:** `POST /api/analyze` returns `{answer, sources, board}` from the self-hosted LLM, grounded in the selected period's numbers + findings. Pure helpers are unit-tested; the LLM call degrades to a templated answer.

### Task A2.1: Pure prompt assembly + board-directive parse

**Files:**
- Create: `api/analyze.js`
- Test: `api/test/analyze.test.js`

- [ ] **Step 1: Write the failing tests**

`api/test/analyze.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyzeContext, parseBoardDirective, fallbackAnswer } from '../analyze.js';

test('buildAnalyzeContext summarizes the period and findings', () => {
  const days = [{ date: '2026-06-01', garmin: { sleep_hours: 7.4, stress_avg: 30 }, manual: { mood: 4 } }];
  const meta = { findings: [{ type: 'correlation', title: 'Сон ↔ Наст · r=+0.62' }] };
  const ctx = buildAnalyzeContext(days, meta);
  assert.match(ctx, /Сон/);
  assert.match(ctx, /r=\+0\.62/);
});

test('parseBoardDirective reads a fenced json board block', () => {
  const text = 'Связь заметная.\n```board\n{"view":"correlation","x":"Сон","y":"Наст"}\n```';
  const { answer, board } = parseBoardDirective(text);
  assert.equal(board.view, 'correlation');
  assert.equal(board.x, 'Сон');
  assert.ok(!answer.includes('```'));
});

test('parseBoardDirective tolerates no board block', () => {
  const { answer, board } = parseBoardDirective('просто текст');
  assert.equal(answer, 'просто текст');
  assert.equal(board, null);
});

test('fallbackAnswer never throws and cites sources', () => {
  const out = fallbackAnswer([{ garmin: { sleep_hours: 7 }, manual: { mood: 4 } }]);
  assert.ok(out.answer.length > 0);
  assert.ok(Array.isArray(out.sources));
});
```

- [ ] **Step 2: Run → FAIL.** `cd api && node --test test/analyze.test.js`

- [ ] **Step 3: Implement**

`api/analyze.js`:
```js
// Pure helpers for the Analytics AI analyst. No network here.
const SRC = { garmin: 'Garmin', wakatime: 'WakaTime', github: 'GitHub', git: 'GitHub', manual: 'Obsidian' };

export function sourcesFor(days) {
  const present = new Set();
  for (const d of days) for (const k of Object.keys(SRC)) if (d?.[k]) present.add(SRC[k]);
  return [...present];
}

export function buildAnalyzeContext(days, meta = {}) {
  const last = days[days.length - 1] || {};
  const g = last.garmin || {};
  const lines = [
    `Период: ${days.length} дн.`,
    `Сегодня: сон ${g.sleep_hours ?? '—'}ч, стресс ${g.stress_avg ?? '—'}, настроение ${last.manual?.mood ?? '—'}/5, код ${last.wakatime?.total_h ?? '—'}ч.`,
  ];
  for (const f of (meta.findings || []).slice(0, 6)) lines.push(`Находка: ${f.title}`);
  return lines.join('\n');
}

const SYS = 'Ты — лаконичный аналитик личного дашборда. Отвечай по-русски, опираясь ТОЛЬКО на переданные числа и находки. 1–4 предложения. Если уместно показать график, добавь в конце блок ```board\\n{"view":"correlation|timeline|weekday|distribution","x":"<метрика>","y":"<метрика|null>"}\\n```.';

export function buildMessages(days, meta, question) {
  return [
    { role: 'system', content: SYS },
    { role: 'user', content: `${buildAnalyzeContext(days, meta)}\n\nВопрос: ${question || 'Сделай разбор периода.'}` },
  ];
}

export function parseBoardDirective(text) {
  const m = text.match(/```board\s*([\s\S]*?)```/);
  if (!m) return { answer: text.trim(), board: null };
  let board = null;
  try { board = JSON.parse(m[1].trim()); } catch { board = null; }
  return { answer: text.replace(m[0], '').trim(), board };
}

export function fallbackAnswer(days) {
  const last = days[days.length - 1] || {};
  const g = last.garmin || {};
  return {
    answer: `LLM недоступен. Кратко по числам: сон ${g.sleep_hours ?? '—'}ч, стресс ${g.stress_avg ?? '—'}, настроение ${last.manual?.mood ?? '—'}/5.`,
    sources: sourcesFor(days),
    board: null,
  };
}
```

- [ ] **Step 4: Run → PASS.** `cd api && node --test test/analyze.test.js`

- [ ] **Step 5: Commit**

```bash
git add api/analyze.js api/test/analyze.test.js
git commit -m "feat(api): analyze prompt/board pure helpers"
```

### Task A2.2: `POST /api/analyze` route

**Files:** Modify `api/server.js`

- [ ] **Step 1:** Read `api/server.js`: note `loadMetrics()`, the auth middleware applied to `/api/*`, and how `ai_insights`-style env (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) would be read (mirror `collector/ai_insights.py`). Import the helpers:
```js
import { buildMessages, parseBoardDirective, fallbackAnswer, sourcesFor } from './analyze.js';
```

- [ ] **Step 2:** Add the route (after the existing `/api/*` routes, inside the authed area):
```js
app.post('/api/analyze', async (req, res) => {
  const { period = 30, question = '' } = req.body || {};
  const metrics = loadMetrics();
  const all = Object.values(metrics.days || {}).sort((a, b) => a.date.localeCompare(b.date));
  const days = all.slice(-Math.max(7, Math.min(365, +period || 30)));
  const base = process.env.LLM_BASE_URL, key = process.env.LLM_API_KEY, model = process.env.LLM_MODEL;
  if (!base || !key || !model) return res.json(fallbackAnswer(days));
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.4, messages: buildMessages(days, metrics.meta || {}, question) }),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}`);
    const text = (await r.json()).choices?.[0]?.message?.content || '';
    const { answer, board } = parseBoardDirective(text);
    res.json({ answer, board, sources: sourcesFor(days) });
  } catch (e) {
    console.warn('analyze fallback:', e.message);
    res.json(fallbackAnswer(days));
  }
});
```
(Ensure `express.json()` body parsing is enabled — it is for `/api/entry`; reuse.)

- [ ] **Step 2b:** Add `.env.example` lines if missing (already present: `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL`). No change needed.

- [ ] **Step 3:** Manual smoke (no LLM env → fallback):
Run the API locally (`cd api && DASHBOARD_PASS= METRICS_PATH="$(pwd)/../data/metrics.json" npm start`), then `curl -s -XPOST localhost:3001/api/analyze -H 'content-type: application/json' -d '{"period":30,"question":"разбор"}'`
Expected: JSON `{answer, sources, board:null}`.

- [ ] **Step 4: Commit**

```bash
git add api/server.js
git commit -m "feat(api): POST /api/analyze (LLM analyst, graceful fallback)"
```

## Phase A3 — Findings lane (frontend)

**Files:**
- Create: `dashboard/src/components/Findings.js`
- Test: `dashboard/test/findings.test.js`

### Task A3.1: Findings lane builder

- [ ] **Step 1: Write the failing test**

`dashboard/test/findings.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { renderFindings } from '../src/components/Findings.js';

describe('renderFindings', () => {
  it('renders a card per finding with a type tag and click data', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    const data = { meta: { findings: [
      { type: 'correlation', title: 'Сон ↔ Наст · r=+0.62', subtitle: 'p<0.01',
        evidence: { view: 'correlation', x: 'Сон', y: 'Наст' } },
      { type: 'anomaly', title: '3 апр — стресс 78', subtitle: 'σ +2.4',
        evidence: { view: 'timeline', x: 'Стр', y: null } },
    ] } };
    renderFindings(container, data);
    expect(container.innerHTML).toContain('Сон ↔ Наст');
    expect(container.innerHTML).toContain('class="tag corr"');
    expect(container.innerHTML).toContain('class="tag anom"');
    expect(container.innerHTML).toContain('data-finding="0"');
  });
  it('empty findings → empty state', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderFindings(container, { meta: { findings: [] } });
    expect(container.innerHTML).toContain('Сбор начнётся ночью');
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd dashboard && npm test -- findings`

- [ ] **Step 3: Implement** `dashboard/src/components/Findings.js`. Reproduce the `.lane` / `.find` markup from `mock-analytics.html` (tags map: correlation→`corr`, threshold→`thr`, anomaly→`anom`, record→`rec`, pattern→`patt`, driver→`corr`). Each card carries `data-finding="<index>"`. On click, call `window.__askFinding?.(index)` (wired in A5). Export `renderFindings(container, data)`:
```js
const TAG = { correlation: 'corr', driver: 'corr', threshold: 'thr', anomaly: 'anom', record: 'rec', pattern: 'patt' };
export function renderFindings(container, data) {
  if (!container) return;
  const items = data.meta?.findings || [];
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><b>Находок пока нет</b><span>Сбор начнётся ночью</span></div>`;
    return;
  }
  container.innerHTML = `<div class="lane">` + items.map((f, i) =>
    `<div class="find" data-finding="${i}"><span class="tag ${TAG[f.type] || 'corr'}">${f.type}</span>` +
    `<div class="fh">${f.title}</div><div class="fsub">${f.subtitle || ''}</div></div>`).join('') + `</div>`;
  container.querySelectorAll?.('.find[data-finding]').forEach((el) =>
    el.addEventListener('click', () => window.__askFinding?.(+el.dataset.finding)));
}
```

- [ ] **Step 4: Run → PASS.** Add the `.lane/.find/.tag*` CSS to `main.css` (copy from mock-analytics.html).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/Findings.js dashboard/test/findings.test.js dashboard/src/styles/main.css
git commit -m "feat(dashboard): findings lane"
```

## Phase A4 — Evidence board (frontend)

**Outcome:** A board that renders any of 4 views for a `{view, x, y, annotations}` state, controllable by the user (view toggle + X↔Y pickers) and by the AI (directive). Pure data builders are tested; Chart.js rendering uses `utils/charts.js`.

### Task A4.1: Board data builders (pure)

**Files:**
- Create: `dashboard/src/components/EvidenceBoard.js`
- Test: `dashboard/test/evidenceBoard.test.js`

- [ ] **Step 1: Write failing tests** for the pure builders only:

`dashboard/test/evidenceBoard.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { METRICS, buildBoardModel } from '../src/components/EvidenceBoard.js';

const data = { days: {
  '2026-06-01': { date: '2026-06-01', weekday: 'Пн', garmin: { sleep_hours: 6, stress_avg: 40 }, manual: { mood: 3 } },
  '2026-06-02': { date: '2026-06-02', weekday: 'Вт', garmin: { sleep_hours: 8, stress_avg: 30 }, manual: { mood: 5 } },
  '2026-06-03': { date: '2026-06-03', weekday: 'Ср', garmin: { sleep_hours: 7, stress_avg: 35 }, manual: { mood: 4 } },
} };

describe('EvidenceBoard model', () => {
  it('exposes metric extractors by label', () => {
    expect(typeof METRICS['Сон']).toBe('function');
    expect(METRICS['Сон']({ garmin: { sleep_hours: 7 } })).toBe(7);
  });
  it('correlation view returns points + r', () => {
    const m = buildBoardModel(data, { view: 'correlation', x: 'Сон', y: 'Наст' }, 30);
    expect(m.view).toBe('correlation');
    expect(m.points.length).toBe(3);
    expect(typeof m.r).toBe('number');
  });
  it('weekday view buckets by day-of-week', () => {
    const m = buildBoardModel(data, { view: 'weekday', x: 'Сон', y: null }, 30);
    expect(m.view).toBe('weekday');
    expect(m.buckets.length).toBe(7);
  });
  it('timeline + distribution return arrays', () => {
    expect(buildBoardModel(data, { view: 'timeline', x: 'Стр', y: null }, 30).series.length).toBe(3);
    expect(buildBoardModel(data, { view: 'distribution', x: 'Сон', y: null }, 30).bins.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd dashboard && npm test -- evidenceBoard`

- [ ] **Step 3: Implement the pure model** in `EvidenceBoard.js` (the render-to-Chart.js wrapper comes in A4.2). Include `METRICS` (label→extractor, reuse the set from `AnalyticsDeep.js`/`findings.py`: Сон, Наст, Стр, Шаг, Код, BB, Готов), `pearson` (import from `readinessDrivers.js`), and `buildBoardModel(data, state, window)` returning per-view models:
```js
import { getDays } from '../utils/dataLoader.js';
import { pearson } from './readinessDrivers.js';

export const METRICS = {
  'Сон':  (d) => d.garmin?.sleep_hours ?? null,
  'Наст': (d) => d.manual?.mood ?? null,
  'Стр':  (d) => d.garmin?.stress_avg ?? null,
  'Шаг':  (d) => d.garmin?.steps ?? null,
  'Код':  (d) => d.wakatime?.total_h ?? d.schedule?.hours_work ?? null,
  'BB':   (d) => d.garmin?.body_battery_max ?? null,
  'Готов':(d) => d.readiness?.score ?? null,
};
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function buildBoardModel(data, state, window = 30) {
  const days = getDays(data, window);
  const x = METRICS[state.x] || (() => null);
  const y = METRICS[state.y] || (() => null);
  if (state.view === 'correlation') {
    const points = days.map((d) => ({ x: x(d), y: y(d), date: d.date })).filter((p) => p.x != null && p.y != null);
    return { view: 'correlation', xLabel: state.x, yLabel: state.y, points,
      r: pearson(points.map((p) => p.x), points.map((p) => p.y)) ?? 0 };
  }
  if (state.view === 'weekday') {
    const buckets = WD.map((wd) => {
      const v = days.filter((d) => d.weekday === wd).map(x).filter((n) => n != null);
      return { wd, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
    });
    return { view: 'weekday', xLabel: state.x, buckets };
  }
  if (state.view === 'distribution') {
    const v = days.map(x).filter((n) => n != null);
    const min = Math.min(...v), max = Math.max(...v) || 1, n = 8, w = (max - min) / n || 1;
    const bins = Array.from({ length: n }, (_, i) => ({ lo: min + i * w, count: 0 }));
    v.forEach((val) => { bins[Math.min(n - 1, Math.floor((val - min) / w))].count++; });
    return { view: 'distribution', xLabel: state.x, bins };
  }
  // timeline
  return { view: 'timeline', xLabel: state.x,
    labels: days.map((d) => d.date.slice(5)),
    series: days.map(x), annotations: state.annotations || [] };
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/EvidenceBoard.js dashboard/test/evidenceBoard.test.js
git commit -m "feat(dashboard): evidence board data model"
```

### Task A4.2: Board rendering (Chart.js + controls)

**Files:** Modify `dashboard/src/components/EvidenceBoard.js`

- [ ] **Step 1:** Add `renderEvidenceBoard(container, data, state)` that: renders the `.board` markup from `mock-analytics.html` (controls: a `.seg` view toggle `корреляция|таймлайн|дни недели|распределение`, two `.pick` X/Y selectors, the `.viz`, and `.bchips`); draws the chart for `buildBoardModel(...)` using Chart.js + `utils/charts.js` (`lineSeries/barSeries/lineOptions/barOptions`); for `correlation` uses a `scatter` type with a trend line + r badge. Maintain module state for the current `{view,x,y}`; wire the toggle + pickers to update state and re-render. Export `setBoardState(state)` so the chat can drive it (used by A5). Destroy the previous Chart before recreating (follow `AnalyticsDeep.replaceChart`).

- [ ] **Step 2:** Add the board CSS (`.bctl/.seg/.pick/.viz/.rbadge/.bchips/.bchip`) to `main.css` from mock-analytics.html.

- [ ] **Step 3: Verify** in the mock preview (after A6/A7): switching the view toggle and pickers re-renders; correlation shows a scatter + r.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/EvidenceBoard.js dashboard/src/styles/main.css
git commit -m "feat(dashboard): evidence board rendering + controls"
```

## Phase A5 — Analyst chat (frontend)

**Files:**
- Create: `dashboard/src/components/AnalystChat.js`

### Task A5.1: Chat component

- [ ] **Step 1: Implement `renderAnalystChat(container, data, { onBoard })`** reproducing the `.chat` markup from mock-analytics.html: a messages area, suggested `.chip`s, and a `.composer` input. On load, POST `/api/analyze` with `{period:30}` to fetch the opener (auto-разбор); render an `ai` bubble with `.src` chips. On send/chip click, POST `{period, question}`; append a `me` bubble then the `ai` answer; if the response has a `board`, call `onBoard(board)` (which calls `setBoardState`). Expose `window.__askFinding = (i) => …` that turns finding `i` into a question (`"Расскажи про: " + findings[i].title`) and, if the finding has `evidence`, also calls `onBoard(finding.evidence)`.

```js
export function renderAnalystChat(container, data, { onBoard } = {}) {
  if (!container) return;
  const findings = data.meta?.findings || [];
  let period = 30;
  container.innerHTML = `
    <div class="ph"><span class="tagdot"></span>AI-аналитик<span class="right">видит данные за период</span></div>
    <div class="msgs" id="anMsgs"></div>
    <div class="chips" id="anChips">
      <span class="chip">Что улучшить на неделе?</span>
      <span class="chip">Объясни последнюю аномалию</span>
      <span class="chip">Сравни с прошлым месяцем</span>
    </div>
    <div class="composer"><input id="anInput" placeholder="Спроси про свои данные за период…"/><span class="send" id="anSend">▶</span></div>`;
  const msgs = container.querySelector('#anMsgs');
  const bubble = (cls, html) => { const d = document.createElement('div'); d.className = `bubble ${cls}`; d.innerHTML = html; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; };
  async function ask(question) {
    if (question) bubble('me', question);
    const pending = bubble('ai', '<div class="who">◇ аналитик</div>…');
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period, question }) });
      const { answer, sources, board } = await r.json();
      pending.innerHTML = `<div class="who">◇ аналитик</div>${answer}` +
        (sources?.length ? `<div class="srcrow">${sources.map((s) => `<span class="src">${s}</span>`).join('')}</div>` : '');
      if (board) onBoard?.(board);
    } catch { pending.innerHTML = '<div class="who">◇ аналитик</div>Не удалось получить ответ.'; }
  }
  container.querySelector('#anSend').addEventListener('click', () => { const i = container.querySelector('#anInput'); if (i.value.trim()) { ask(i.value.trim()); i.value = ''; } });
  container.querySelector('#anChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) ask(c.textContent); });
  window.__askFinding = (i) => { const f = findings[i]; if (!f) return; if (f.evidence) onBoard?.(f.evidence); ask(`Расскажи про: ${f.title}`); };
  ask('');  // opener (auto-разбор)
}
```

- [ ] **Step 2:** Add the chat CSS (`.chat/.msgs/.bubble/.who/.src/.chip/.composer`) to `main.css` from mock-analytics.html.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/AnalystChat.js dashboard/src/styles/main.css
git commit -m "feat(dashboard): analyst chat"
```

## Phase A6 — Wire the Analytics tab + remove old

**Files:** Modify `dashboard/index.html`, `dashboard/src/main.js`; delete `AnalyticsDeep.js` + its tests.

- [ ] **Step 1:** In `index.html`, replace `#tab-analytics`'s body with the lab structure: `<section id="anFindings"></section>` + a `<div class="body2"><div class="panel chat" id="anChat"></div><div class="panel board" id="anBoard"></div></div>` (markup per mock-analytics.html, plus the header/period). Remove `#analyticsDeep`.

- [ ] **Step 2:** In `main.js`: drop `AnalyticsDeep` imports and the `renderAnalyticsDeep`/`activateAnalyticsDeep` usage in `ensureAnalytics` and `__openAnalytics`. New `ensureAnalytics()`:
```js
import { renderFindings } from './components/Findings.js';
import { renderAnalystChat } from './components/AnalystChat.js';
import { renderEvidenceBoard, setBoardState } from './components/EvidenceBoard.js';
function ensureAnalytics() {
  if (analyticsLoaded) return; analyticsLoaded = true;
  renderFindings(document.getElementById('anFindings'), data);
  renderEvidenceBoard(document.getElementById('anBoard'), data, { view: 'correlation', x: 'Сон', y: 'Наст' });
  renderAnalystChat(document.getElementById('anChat'), data, { onBoard: (b) => setBoardState(b) });
}
```
Keep `window.__openAnalytics` as a thin no-op or repurpose to switch to the Analytics tab (the Overview's drill links can call it: it just `activateTab('analytics', …)`). Update the Overview drill handlers if they referenced `activateAnalyticsDeep`.

- [ ] **Step 3:** Delete `dashboard/src/components/AnalyticsDeep.js` and `dashboard/test/analyticsDeep.test.js`. Run `cd dashboard && npm test` — fix any remaining imports.

- [ ] **Step 4: Verify** `npm run build` passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): analytics tab → AI lab (replace AnalyticsDeep)"
```

## Phase A7 — Mock stubs for Analytics

**Files:** Modify `dashboard/vite.mock.config.js`

- [ ] **Step 1:** In `buildMetrics()`, attach `meta.findings` (reuse the mock-overview correlation strings; add ~6 typed findings matching `mock-analytics.html`).

- [ ] **Step 2:** Add a route: `if (url === '/api/analyze') { ... }` returning a **scripted** answer that varies by `question` (read `req` body): an opener + a couple canned `{answer, sources, board}` responses (e.g., for "сон/настроение" → `board:{view:'correlation',x:'Сон',y:'Наст'}`). Collect the POST body (the mock middleware must read `req` data; add a small body reader).

- [ ] **Step 3: Verify** in preview: open `/`, switch to Analytics — findings render, chat shows opener + answers, board reacts. Screenshot; compare to `mock-analytics.html`. No console errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/vite.mock.config.js
git commit -m "test(dashboard): mock /api/analyze + meta.findings"
```

**Part A acceptance:** Analytics renders findings + analyst chat + evidence board from `metrics.json` and `/api/analyze`; board switches view/pair via user controls and via AI directives; pytest + vitest + `node --test` green; `npm run build` clean; no console errors; matches `mock-analytics.html`.

---
---

# PART B — INFRASTRUCTURE (HOMELAB COCKPIT)

## Phase B1 — nginx route parser (API, pure)

**Files:**
- Create: `api/nginxRoutes.js`
- Test: `api/test/nginxRoutes.test.js`

### Task B1.1: Parse `server_name` → `proxy_pass`

- [ ] **Step 1: Write failing tests**

`api/test/nginxRoutes.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNginx } from '../nginxRoutes.js';

const CONF = `
server { server_name chat.gigglin.tech;
  location / { proxy_pass http://librechat:3080; } }
server { server_name omni.gigglin.tech;
  location / { proxy_pass http://omniroute:8080; } }
`;

test('parseNginx maps host -> {url, upstreamHost, upstreamPort}', () => {
  const routes = parseNginx(CONF);
  const chat = routes.find((r) => r.upstreamHost === 'librechat');
  assert.equal(chat.url, 'https://chat.gigglin.tech');
  assert.equal(chat.upstreamPort, '3080');
  assert.equal(routes.length, 2);
});

test('parseNginx tolerates empty/garbage', () => {
  assert.deepEqual(parseNginx(''), []);
  assert.deepEqual(parseNginx('not nginx'), []);
});
```

- [ ] **Step 2: Run → FAIL.** `cd api && node --test test/nginxRoutes.test.js`

- [ ] **Step 3: Implement** `api/nginxRoutes.js`:
```js
// Pure nginx config parser: extract server_name -> proxy_pass upstreams.
export function parseNginx(conf = '') {
  const routes = [];
  // crude server{} block split is fine for our managed configs
  const blocks = String(conf).split(/server\s*\{/).slice(1);
  for (const b of blocks) {
    const name = (b.match(/server_name\s+([^;]+);/) || [])[1];
    const pass = (b.match(/proxy_pass\s+https?:\/\/([a-z0-9_.-]+):(\d+)/i) || []);
    if (!name || !pass[1]) continue;
    const host = name.trim().split(/\s+/)[0];
    routes.push({ url: `https://${host}`, host, upstreamHost: pass[1], upstreamPort: pass[2] });
  }
  return routes;
}

export function readNginxRoutes(path = process.env.NGINX_CONF_PATH) {
  if (!path) return [];
  try { return parseNginx(require('fs').readFileSync(path, 'utf8')); } catch { return []; }
}
```
(Add `NGINX_CONF_PATH` to `.env.example` with a comment.)

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add api/nginxRoutes.js api/test/nginxRoutes.test.js .env.example
git commit -m "feat(api): nginx route parser"
```

## Phase B2 — Guacamole VMs (API)

**Files:** Create `api/guacamole.js`

### Task B2.1: Read Guacamole connections

- [ ] **Step 1:** Implement `getGuacConnections()` returning `[{ name, protocol, hostname, port }]`. Prefer the Guacamole REST API when `GUAC_URL`/`GUAC_USER`/`GUAC_PASS` are set (token auth → `GET /api/session/data/{ds}/connections`); else return `[]`. Pure transform `mapGuacConnections(json)` is unit-testable:

```js
export function mapGuacConnections(json) {
  return Object.values(json || {}).map((c) => ({
    name: c.name, protocol: c.protocol,
    hostname: c.parameters?.hostname, port: c.parameters?.port,
  })).filter((c) => c.name);
}
```

- [ ] **Step 2:** Add a node test `api/test/guacamole.test.js` asserting `mapGuacConnections({...})` extracts name/protocol/hostname. Run → implement → pass.

- [ ] **Step 3:** Add `GUAC_URL/GUAC_USER/GUAC_PASS` to `.env.example` (commented, optional).

- [ ] **Step 4: Commit** `feat(api): guacamole connections reader`.

## Phase B3 — Topology assembly (API)

**Files:**
- Create: `api/infraTopology.js`
- Test: `api/test/infraTopology.test.js`

### Task B3.1: Pure assembly from inputs

- [ ] **Step 1: Write failing tests** for the pure `assembleTopology({containers, networks, routes, vms, telemetry, host})`:

`api/test/infraTopology.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleTopology } from '../infraTopology.js';

test('groups containers by network and builds nodes', () => {
  const out = assembleTopology({
    containers: [
      { name: 'librechat', networks: ['librechat-net'], state: 'running', image: 'librechat:latest',
        labels: { 'dashboard.purpose': 'Чат с LLM', 'dashboard.tech': 'Node' }, cpu: 14, mem: 672 },
      { name: 'librechat-pg', networks: ['librechat-net'], state: 'running', image: 'postgres:16', cpu: 2, mem: 410 },
    ],
    networks: ['librechat-net'], routes: [{ upstreamHost: 'librechat', url: 'https://chat.x' }],
    vms: [{ name: 'work-vm', protocol: 'vnc' }], telemetry: { cpu: [], ram: [], net: [] },
    host: { name: 'srv' },
  });
  const net = out.networks.find((n) => n.name === 'librechat-net');
  assert.equal(net.services.length, 2);
  const app = net.services.find((s) => s.name === 'librechat');
  assert.equal(app.url, 'https://chat.x');
  assert.equal(app.purpose, 'Чат с LLM');
  assert.ok(out.standalone.some((s) => s.role === 'vm' && s.name === 'work-vm'));
  assert.ok(out.edges.some((e) => e.type === 'vnc'));
});
```

- [ ] **Step 2: Run → FAIL.** `cd api && node --test test/infraTopology.test.js`

- [ ] **Step 3: Implement** `assembleTopology(inputs)` (pure): group containers by their first network; enrich each with its nginx route url + labels (`dashboard.purpose/tech/group`, fallback to image); build `standalone` (nginx, external-llm, vms, netdata) and `edges` (gateway→networks, guac→vm vnc, omniroute→external-llm). Keep deterministic ordering. Also export `collectTopology()` (impure) that gathers inputs from dockerode (`listContainers` + `inspect` for networks/labels, or `NetworkSettings`), `readNginxRoutes()`, `getGuacConnections()`, and Netdata (reuse the existing `getNetdataChart` helper in server.js — pass it in), then calls `assembleTopology`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `feat(api): topology assembly`.

### Task B3.2: `GET /api/infra/topology` route

**Files:** Modify `api/server.js`

- [ ] **Step 1:** Import `collectTopology`; add route returning `await collectTopology({ docker, getNetdataChart })` (pass the existing dockerode client + Netdata helper). On any failure, return `{ host:{}, telemetry:{cpu:[],ram:[],net:[]}, networks:[], standalone:[], edges:[] }`. Auth-guarded like other `/api/*`.

- [ ] **Step 2: Smoke:** `curl -s localhost:3001/api/infra/topology | head` returns JSON (possibly mostly empty without Docker/Netdata — that's fine).

- [ ] **Step 3: Commit** `feat(api): GET /api/infra/topology`.

## Phase B4 — Frontend: host vitals + live telemetry

**Files:** Create `dashboard/src/components/HostVitals.js`, `dashboard/src/components/LiveTelemetry.js`

### Task B4.1: HostVitals

- [ ] **Step 1:** Implement `renderHostVitals(container, topology)` reproducing the `.node` card + `.vc` compact vitals from `mock-infrastructure.html` (hostname, status, uptime, hw, os, container count; 4 metric rows CPU/RAM/Disk/Net with bars). Pure string builder; no test required beyond a smoke render (optional vitest asserting it contains the hostname).

- [ ] **Step 2:** Add `.node/.vc/.vr` CSS to `main.css` from the mock.

- [ ] **Step 3: Commit** `feat(dashboard): host vitals`.

### Task B4.2: LiveTelemetry chart

- [ ] **Step 1:** Implement `renderLiveTelemetry(container, topology, win)` — a Chart.js multi-series area chart (CPU/RAM/Net) from `topology.telemetry`, using `utils/charts.js` (`lineSeries` + `gradientFill` + `lineOptions`). Header with the period toggle `10м/1ч/6ч/24ч`; clicking re-fetches `/api/infra/topology?minutes=…` and re-renders. Destroy prior chart before recreate.

- [ ] **Step 2:** Add `.livewrap/.livechart/.leg` CSS from the mock.

- [ ] **Step 3: Commit** `feat(dashboard): live telemetry chart`.

## Phase B5 — Frontend: stack topology

**Files:**
- Create: `dashboard/src/components/StackTopology.js`
- Test: `dashboard/test/stackTopology.test.js`

### Task B5.1: Topology builder (pure)

- [ ] **Step 1: Write failing test:**

`dashboard/test/stackTopology.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { renderStackTopology } from '../src/components/StackTopology.js';

const topo = {
  networks: [{ name: 'librechat-net', services: [
    { name: 'LibreChat', tech: 'Node', status: 'running', cpu: 14, mem: 672, url: 'https://chat.x', role: 'app' },
    { name: 'Postgres', tech: 'pg16', status: 'running', cpu: 2, mem: 410, role: 'db' },
  ] }],
  standalone: [{ name: 'nginx', role: 'gateway', status: 'running' },
               { name: 'work-vm', role: 'vm', status: 'running', open: 'https://rdp.x' }],
  edges: [{ from: 'nginx', to: 'librechat-net', type: 'http' }],
};

describe('renderStackTopology', () => {
  it('renders a network box with its services and an SVG edge layer', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderStackTopology(container, topo);
    expect(container.innerHTML).toContain('librechat-net');
    expect(container.innerHTML).toContain('LibreChat');
    expect(container.innerHTML).toContain('class="net"');
    expect(container.innerHTML).toContain('<svg');
    expect(container.innerHTML).toContain('work-vm');
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd dashboard && npm test -- stackTopology`

- [ ] **Step 3: Implement** `renderStackTopology(container, topology)` reproducing `mock-infrastructure.html`'s `.topo` markup: a layered layout placing `nginx`/external/VM/Netdata as `.tnode`s and each network as a `.net` box (label + app `.inode` + data `.datarow`), plus an `<svg class="edges">` drawing curved paths for `topology.edges`. v1 uses a **curated layered placement** (gateway left, networks in a 2-col grid, external/VM/netdata right/bottom) computed from counts — not physics. App/VM nodes with `url`/`open` get a `.open` "↗ открыть" that calls `window.__openApp?.(name|url)`.

- [ ] **Step 4: Run → PASS.** Append the `.topo/.tnode/.net/.inode/.edge*/.ring2` CSS from the mock to `main.css`.

- [ ] **Step 5: Commit** `feat(dashboard): stack topology`.

## Phase B6 — Wire the Infrastructure tab + remove old

**Files:** Modify `dashboard/index.html`, `dashboard/src/main.js`; delete `ServerMetrics.js`.

- [ ] **Step 1:** In `index.html`, replace `#tab-devops` body with: header + period, `<div class="top">…host vitals + live chart containers…</div>`, and `<div id="stackTopo"></div>` (markup per mock-infrastructure.html). Remove `#serverMetrics`.

- [ ] **Step 2:** In `main.js`, replace `ensureServerMetrics()`:
```js
import { renderHostVitals } from './components/HostVitals.js';
import { renderLiveTelemetry } from './components/LiveTelemetry.js';
import { renderStackTopology } from './components/StackTopology.js';
let infraLoaded = false;
async function ensureInfra() {
  if (infraLoaded) return; infraLoaded = true;
  const t = await fetch('/api/infra/topology').then((r) => r.json()).catch(() => ({}));
  renderHostVitals(document.getElementById('infraVitals'), t);
  renderLiveTelemetry(document.getElementById('infraLive'), t, 60);
  renderStackTopology(document.getElementById('stackTopo'), t);
}
```
Call `ensureInfra()` in `activateTab` for `tabName === 'devops'` (replace the `ensureServerMetrics` call). Add `window.__openApp = (urlOrName) => …` that opens the matching iframe tab or `window.open(url)`.

- [ ] **Step 3:** Delete `dashboard/src/components/ServerMetrics.js`; remove dead `.srv-*` CSS. Run `npm test` + `npm run build`; fix imports.

- [ ] **Step 4: Commit** `refactor(dashboard): infrastructure tab → homelab cockpit`.

## Phase B7 — Mock stub for Infrastructure

**Files:** Modify `dashboard/vite.mock.config.js`

- [ ] **Step 1:** Add `buildTopology()` returning the representative stack from `mock-infrastructure.html` (host, telemetry arrays, 4 networks each with app+db+redis, standalone nginx/external-llm/work-vm/netdata, edges). Replace the old `/api/metrics/server` stub usage if present; add `if (url.startsWith('/api/infra/topology')) return json(buildTopology());`.

- [ ] **Step 2: Verify** in preview: Infrastructure tab shows vitals + live chart + topology with network groups + VM; matches `mock-infrastructure.html`; no console errors. Screenshot at 1340px desktop.

- [ ] **Step 3: Commit** `test(dashboard): mock /api/infra/topology`.

**Part B acceptance:** Infrastructure renders host vitals + live telemetry + a network-grouped living topology from `/api/infra/topology`; nginx/guacamole/topology pure logic unit-tested; `node --test` + vitest green; `npm run build` clean; no console errors; matches `mock-infrastructure.html`.

---
---

# PART C — DEMO MODE (after Parts A + B)

**Outcome:** A password-free **static** build (`VITE_DEMO=1 vite build`) that renders every tab from **in-browser** mock data (dates relative to today), with no `/api/*` calls, auth bypassed, embedded-app iframes replaced by safe placeholders. Single source of truth — the demo *is* the real app fed by the dev-mock generators (no fork, no rot).

**Decisions on record:** flag in this repo (NOT a separate repo); demo runs after A+B so it showcases the AI lab + topology. Reuses the generators already in `dashboard/vite.mock.config.js`.

## Phase C1 — Extract generators (DRY)

**Files:** Create `dashboard/src/demo/demoData.js`; Modify `dashboard/vite.mock.config.js`

- [ ] **Step 1:** Move the pure generators (`buildMetrics`, `buildForecast`, `buildSchedule`, `buildTopology`, the scripted `analyze` responses, `meta.findings`) out of `vite.mock.config.js` into `src/demo/demoData.js` as exported functions (no Vite/node deps; dates via `new Date()` so the latest day is always "today").
- [ ] **Step 2:** `vite.mock.config.js` imports from `src/demo/demoData.js` and serves them via middleware (dev behavior unchanged). Run the mock preview to confirm parity (all tabs render as before).
- [ ] **Step 3: Commit** `refactor(dashboard): extract demo data generators (DRY with mock)`.

## Phase C2 — Demo flag + in-browser data provider

**Files:** Create `dashboard/src/utils/demo.js`; Modify `dataLoader.js`, `AnalystChat.js`, `EvidenceBoard.js` fetch, infra fetch + `init()` in `main.js`.

- [ ] **Step 1:** `src/utils/demo.js`:
```js
import { buildMetrics, buildForecast, buildSchedule, buildTopology, scriptedAnalyze } from '../demo/demoData.js';
export const DEMO = import.meta.env.VITE_DEMO === '1' || location.hostname.startsWith('demo.');
const ROUTES = {
  '/api/sync': () => buildMetrics(), '/api/metrics': () => buildMetrics(),
  '/api/forecast': () => buildForecast(), '/api/schedule': () => buildSchedule(),
  '/api/infra/topology': () => buildTopology(),
};
export async function demoFetch(url, opts) {
  const path = url.split('?')[0];
  if (path === '/api/analyze') return { json: async () => scriptedAnalyze(JSON.parse(opts?.body || '{}')) };
  const fn = ROUTES[path];
  return { ok: true, headers: { get: () => 'application/json' }, json: async () => (fn ? fn() : {}) };
}
```
- [ ] **Step 2:** At each data-access site, branch on `DEMO` → use `demoFetch` instead of `fetch('/api/*')` (or wrap a single `apiFetch(url,opts)` used everywhere). In `init()` (main.js), if `DEMO`, skip `initAuth()`/login entirely and proceed.
- [ ] **Step 3:** Run `cd dashboard && VITE_DEMO=1 npm run dev` — all tabs render with fake data, no login, zero failed `/api/*` in the console.
- [ ] **Step 4: Commit** `feat(dashboard): demo flag + in-browser data provider`.

## Phase C3 — Safe iframes + DEMO badge

**Files:** Modify `main.js`, `index.html`, `main.css`

- [ ] **Step 1:** In demo, the app-iframe tabs render a placeholder ("Доступно в полной версии") instead of loading real URLs — guard `loadAppIframe`/`__openApp`. Topology/live-strip "↗ открыть" become no-ops/placeholders in demo.
- [ ] **Step 2:** Add a "DEMO" badge in the header, shown only when `DEMO`.
- [ ] **Step 3: Commit** `feat(dashboard): demo iframe placeholders + badge`.

## Phase C4 — Build & deploy

- [ ] **Step 1:** `cd dashboard && VITE_DEMO=1 npm run build`; serve it (`npx serve dist`) and verify all tabs render, no `/api/*` requests, no console errors.
- [ ] **Step 2:** Document the static deploy target (`demo.<domain>` on GH Pages/Netlify/nginx); optionally add a GitHub Actions job that builds + publishes the demo artifact.
- [ ] **Step 3: Commit** `chore: demo static build + deploy notes`.

**Part C acceptance:** `VITE_DEMO=1 npm run build` produces a static site rendering Overview + Analytics (AI lab) + Infrastructure (topology) with fresh-dated mock data, no auth, no backend calls, safe iframes; no console errors.

---

## Cross-cutting / final

- [ ] **Full sweep:** `cd collector && python -m pytest`, `cd api && npm test`, `cd dashboard && npm test`, `cd dashboard && npm run build` — all green.
- [ ] **Preview both tabs** via the mock harness; capture screenshots; compare to the two mockups; `preview_console_logs level=error` empty.
- [ ] **Docs:** update `docs/ORIENTATION.md` — add `/api/analyze`, `/api/infra/topology`, `meta.findings`, the new env (`NGINX_CONF_PATH`, `GUAC_*`), and that AnalyticsDeep/ServerMetrics were replaced.
- [ ] Temp mock files (`mock-analytics.html`, `mock-infrastructure.html`) stay until the demo-mode work consumes/retires them.

## Self-Review (performed against both specs)

- **Spec coverage — Analytics:** findings (6 types) → A1; AI analyst chat + endpoint → A2/A5; evidence board (4 views, any pair, AI+user control) → A4; findings lane → A3; demo scripted → A7; replaces AnalyticsDeep → A6. **Infrastructure:** host vitals + live chart → B4; living topology grouped by Docker networks → B3/B5; sources Docker/Netdata/nginx/Guacamole/labels → B1/B2/B3; navigation (dropdown kept + node open) → B6 `__openApp`; demo stub → B7; VM via Guacamole → B2/B3/B5; deferred VM-internal metrics noted (not implemented). 
- **Placeholder scan:** logic-heavy tasks (A1.1, A2.1, A4.1, B1.1, B3.1, B5.1) carry full code + tests; UI/wiring tasks give exact markup source (the mockups), signatures, and acceptance — no "TBD/handle edge cases".
- **Type/name consistency:** `build_findings` (A1) → `meta.findings` consumed by `renderFindings` (A3), `buildAnalyzeContext` (A2), and the board via `finding.evidence` (A5→`setBoardState`); `buildBoardModel`/`METRICS` (A4) names match A5 usage; `assembleTopology` output shape (B3) matches `renderStackTopology` input (B5) and the mock stub (B7); `parseNginx`/`mapGuacConnections` feed `collectTopology` (B3). `window.__askFinding` (A3→A5) and `window.__openApp` (B5→B6) defined where used.
