# Life Dashboard — Content Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard's *content* into a data-rich, explorable "Overview" — a transparent composite "Day Readiness" score with concentric rings, three domain cards (Body/Mind/Work), a live strip, a correlation matrix, and real trend charts — backed by deeper dev-activity and self-hosted-LLM insights.

**Architecture:** Python collectors (`collector/`) fetch data and write a single `metrics.json` (per-day objects + a `meta` block). **All derived values (readiness per day, correlation matrix, AI brief) are computed in the Python collector** and written into `metrics.json`, so the Express API keeps serving the file unchanged and the frontend stays a pure renderer. The Vite/vanilla-JS frontend (`dashboard/`) reads `metrics.json` via `/api/sync` and renders modular components that return HTML/SVG strings (pure builders → unit-testable; thin DOM wrappers). Real-time "now" is added last via socket.io.

**Tech Stack:** Vite + vanilla JS ES modules, Chart.js, socket.io-client (frontend); Express + socket.io (`api/`); Python 3 + `requests` (`collector/`). Tests: **vitest** (frontend pure logic) and **pytest** + **responses** (collectors).

**Reference spec:** `docs/superpowers/specs/2026-06-04-dashboard-content-redesign-design.md`
**Reference mockup (visual target):** `dashboard/public/mock-overview.html` (temporary; open in the Vite mock server to see the intended result).

---

## Conventions for the implementing engineer

- **Read before writing.** For each "Modify" file, open it first and follow existing patterns (naming, formatting, how components mutate `container.innerHTML`, how `run_collect.py` assembles day objects).
- **Day object shape** (current, before this plan):
  ```jsonc
  { "date":"2026-06-04", "week_iso":"2026-W23", "weekday":"Чт",
    "manual": { "mood": 4, "note": "" },
    "garmin": { "sleep_hours":7.4, "sleep_score":78, "sleep_phases":{"deep_h":1.1,"light_h":3.9,"rem_h":1.8,"awake_h":0.6},
                "body_battery_max":71, "body_battery_min":18, "steps":8870, "stress_avg":34,
                "resting_hr":54, "spo2_avg":96, "spo2_low":90 },
    "git": { "commits":16, "repos":["life-dashboard"] },
    "schedule": { "wake_time":"06:30", "hours_sleep":7.4, "hours_work":5.0, "hours_projects":2.0,
                  "hours_games":1.0, "hours_rest":2.0, "hours_food":1.5 } }
  ```
  HRV may be absent in `garmin`; treat missing fields as `null` everywhere.
- **`metrics.json` top level:** `{ "days": { "<date>": <day> }, "meta": { ... } }`.
- **Colors (resolved sRGB of the design tokens):** green `#59be6c`, aqua `#5dc0a7`, blue `#69aed5`, yellow `#e2c162`, orange `#e99355`, purple `#c88ec3`, red `#e3645e`, fg `#eaeff3`, fg-dim `#a3acb3`, fg-muted `#727c84`, bg0 `#0b1219`. Prefer CSS vars (`var(--green)` …) in CSS; use these hexes only in JS/Chart.js/SVG.
- **Commit after every task** with the shown message. Branch off the default branch first; do not commit to the default branch.

---

## File Structure (created / modified by this plan)

**Collector (Python):**
- Create `collector/metrics_calc.py` — pure functions: `compute_readiness(day)`, `pearson(xs, ys)`, `build_correlations(days)`.
- Create `collector/sources/wakatime_source.py` — daily coding stats.
- Create `collector/sources/github_source.py` — PRs/reviews/streak/langs.
- Create `collector/sources/ci_source.py` — latest CI/CD run statuses.
- Create `collector/ai_insights.py` — LLM brief from metrics + correlations.
- Modify `collector/run_collect.py` — call new sources, attach `readiness` per day, write `meta.correlations` + `meta.ai_brief` + `meta.now`.
- Create `collector/tests/` — pytest unit tests.
- Modify `collector/requirements.txt` — add `pytest`, `responses`.

**Frontend (dashboard/src):**
- Create `components/microcharts.js` — pure string builders: `multiRing`, `rangeBar`, `stageBar`, `donut`, `sparkline`, `streakDots`, `heatmapMatrix`.
- Create `components/Hero.js` — readiness hero (rings + factors + 14d strip + reco + AI brief).
- Create `components/LiveStrip.js` — 4 live cells.
- Create `components/Domains.js` — data-driven Body/Mind/Work cards.
- Create `components/CorrelationPanel.js` — matrix + strongest-links list.
- Create `components/OverviewTrends.js` — multi-series area chart (Chart.js).
- Create `components/AnalyticsDeep.js` — Phase 4 deep-dive views + drill-down.
- Modify `utils/dataLoader.js` — add `getLatestReadiness`, expose `meta`.
- Modify `index.html` — new Overview containers, "Приложения ▾" tab group, Analytics sub-tabs.
- Modify `main.js` — wire components, tab/drilldown logic, socket `now_pulse` (Phase 5).
- Modify `styles/main.css` — append component styles.
- Create `test/` — vitest unit tests.
- Modify `package.json` — add `vitest`, `"test": "vitest run"`.

**API (api/):** untouched until Phase 5 (then add `now_pulse` socket emit).

---

# PHASE 1 — Overview frontend on existing data

**Outcome:** A working new Overview tab rendering from current `metrics.json` (Garmin/Git/Obsidian). Readiness + correlations computed in the collector. New collectors and AI are stubbed (templated brief, Work domain shows Git only). Everything renders against the Vite mock server.

### Task 1.1: Frontend test tooling

**Files:**
- Modify: `dashboard/package.json`
- Create: `dashboard/test/smoke.test.js`

- [x] **Step 1: Install vitest**

Run: `cd dashboard && npm install -D vitest`
Expected: `vitest` added to devDependencies.

- [x] **Step 2: Add test script**

In `dashboard/package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [x] **Step 3: Write a smoke test**

`dashboard/test/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';
describe('tooling', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

- [x] **Step 4: Run**

Run: `cd dashboard && npm test`
Expected: 1 passed.

- [x] **Step 5: Commit**

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/test/smoke.test.js
git commit -m "test: add vitest to dashboard"
```

### Task 1.2: Readiness computation (Python, pure)

**Files:**
- Create: `collector/metrics_calc.py`
- Create: `collector/tests/test_metrics_calc.py`
- Modify: `collector/requirements.txt`

- [x] **Step 1: Add pytest deps**

Append to `collector/requirements.txt`:
```
pytest
responses
```
Run: `cd collector && pip install -r requirements.txt`

- [x] **Step 2: Write failing tests**

`collector/tests/test_metrics_calc.py`:
```python
from collector.metrics_calc import compute_readiness, pearson, build_correlations

def test_readiness_full():
    day = {"garmin": {"sleep_score": 80, "body_battery_max": 70,
                      "stress_avg": 34, "hrv": 58}}
    r = compute_readiness(day, hrv_baseline=58)
    assert r["sleep"] == 80 and r["energy"] == 70 and r["calm"] == 66
    assert r["hrv"] == 50  # 58 vs baseline 58 -> mid (50)
    # 0.35*80 + 0.30*70 + 0.20*66 + 0.15*50 = 28 + 21 + 13.2 + 7.5 = 69.7 -> 70
    assert r["score"] == 70

def test_readiness_missing_factor_reweights():
    day = {"garmin": {"sleep_score": 80, "body_battery_max": 70, "stress_avg": 34}}
    r = compute_readiness(day, hrv_baseline=None)
    assert r["hrv"] is None
    # weights renormalised over sleep/energy/calm: 0.35/0.85, 0.30/0.85, 0.20/0.85
    expected = round((0.35*80 + 0.30*70 + 0.20*66) / 0.85)
    assert r["score"] == expected

def test_pearson_known():
    assert pearson([1, 2, 3, 4], [2, 4, 6, 8]) == 1.0
    assert pearson([1, 2, 3], [3, 2, 1]) == -1.0
    assert pearson([1, 1, 1], [1, 2, 3]) is None  # zero variance

def test_build_correlations_shape():
    days = [{"garmin": {"sleep_hours": h, "stress_avg": 50 - h},
             "manual": {"mood": min(5, h - 2)}} for h in range(4, 9)]
    out = build_correlations(days)
    assert "matrix" in out and "labels" in out and "strongest" in out
    assert len(out["labels"]) == len(out["matrix"])
```

- [x] **Step 3: Run to verify failure**

Run: `cd collector && python -m pytest tests/test_metrics_calc.py -v`
Expected: FAIL (module not found).

- [x] **Step 4: Implement**

`collector/metrics_calc.py`:
```python
"""Pure derived-metric calculations: readiness, correlations."""
from statistics import mean, pstdev

# Component weights for the composite Day Readiness score (v1, tunable).
WEIGHTS = {"sleep": 0.35, "energy": 0.30, "calm": 0.20, "hrv": 0.15}


def _clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def compute_readiness(day, hrv_baseline=None):
    """Return {score, sleep, energy, calm, hrv}. Missing factors are dropped
    and remaining weights renormalised so the score reflects available data."""
    g = (day or {}).get("garmin") or {}

    sleep = g.get("sleep_score")
    energy = g.get("body_battery_max")
    stress = g.get("stress_avg")
    calm = None if stress is None else _clamp(100 - stress)

    hrv_raw = g.get("hrv")
    if hrv_raw is None or not hrv_baseline:
        hrv = None
    else:  # scale around personal baseline: baseline -> 50, +/-50% -> 0..100
        hrv = _clamp(round(50 + (hrv_raw - hrv_baseline) / hrv_baseline * 100))

    factors = {"sleep": sleep, "energy": energy, "calm": calm, "hrv": hrv}
    present = {k: v for k, v in factors.items() if v is not None}
    if not present:
        score = None
    else:
        wsum = sum(WEIGHTS[k] for k in present)
        score = round(sum(WEIGHTS[k] * v for k, v in present.items()) / wsum)

    return {"score": score, **factors}


def pearson(xs, ys):
    """Pearson r over paired non-null values; None if <3 pairs or zero variance."""
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 3:
        return None
    xa = [p[0] for p in pairs]
    ya = [p[1] for p in pairs]
    sx, sy = pstdev(xa), pstdev(ya)
    if sx == 0 or sy == 0:
        return None
    mx, my = mean(xa), mean(ya)
    cov = mean((x - mx) * (y - my) for x, y in pairs)
    return round(cov / (sx * sy), 2)


# (label, extractor) for the correlation matrix. Extend as new sources land.
CORR_METRICS = [
    ("Сон",  lambda d: (d.get("garmin") or {}).get("sleep_hours")),
    ("Наст", lambda d: (d.get("manual") or {}).get("mood")),
    ("Стр",  lambda d: (d.get("garmin") or {}).get("stress_avg")),
    ("Код",  lambda d: (d.get("wakatime") or {}).get("total_h")
                       or (d.get("schedule") or {}).get("hours_work")),
    ("Шаг",  lambda d: (d.get("garmin") or {}).get("steps")),
    ("BB",   lambda d: (d.get("garmin") or {}).get("body_battery_max")),
]


def build_correlations(days):
    labels = [m[0] for m in CORR_METRICS]
    cols = [[ex(d) for d in days] for _, ex in CORR_METRICS]
    n = len(labels)
    matrix = [[1.0 if i == j else pearson(cols[i], cols[j]) for j in range(n)]
              for i in range(n)]
    strongest = []
    for i in range(n):
        for j in range(i + 1, n):
            r = matrix[i][j]
            if r is not None:
                strongest.append({"a": labels[i], "b": labels[j], "r": r})
    strongest.sort(key=lambda c: abs(c["r"]), reverse=True)
    return {"labels": labels, "matrix": matrix, "strongest": strongest[:4]}
```

Also create `collector/tests/__init__.py` (empty) if `collector/__init__.py` exists so imports resolve. Run pytest from the repo root if needed: `python -m pytest collector/tests -v`.

- [x] **Step 5: Run to verify pass**

Run: `cd collector && python -m pytest tests/test_metrics_calc.py -v`
Expected: 4 passed.

- [x] **Step 6: Commit**

```bash
git add collector/metrics_calc.py collector/tests/test_metrics_calc.py collector/requirements.txt
git commit -m "feat(collector): readiness + correlation calculations"
```

### Task 1.3: Wire derived metrics into `run_collect.py`

**Files:**
- Modify: `collector/run_collect.py`

- [x] **Step 1: Read `run_collect.py`** and find where the `metrics` dict (`{"days": {...}, "meta": {...}}`) is assembled and written to disk.

- [x] **Step 2: After all day objects are built, attach readiness and meta.** Add near the end, before writing the file:
```python
from collector.metrics_calc import compute_readiness, build_correlations

# personal HRV baseline = median of last 30 days' garmin.hrv (if present)
hrv_vals = [d.get("garmin", {}).get("hrv") for d in metrics["days"].values()]
hrv_vals = sorted(v for v in hrv_vals if v is not None)
hrv_baseline = hrv_vals[len(hrv_vals) // 2] if hrv_vals else None

for day in metrics["days"].values():
    day["readiness"] = compute_readiness(day, hrv_baseline)

ordered = [metrics["days"][k] for k in sorted(metrics["days"])]
metrics.setdefault("meta", {})["correlations"] = build_correlations(ordered[-30:])
```
(Match the actual variable name used in the file for the metrics dict.)

- [x] **Step 3: Run the collector** (or its dry-run) and confirm `metrics.json` now contains `days.<date>.readiness` and `meta.correlations`.

Run: `cd collector && python run_collect.py` (or the project's documented collect command)
Expected: no errors; inspect the output JSON for the new keys.

- [x] **Step 4: Commit**

```bash
git add collector/run_collect.py
git commit -m "feat(collector): attach readiness per day and correlations to meta"
```

### Task 1.4: Extend the Vite mock so the new fields render locally

**Files:**
- Modify: `dashboard/vite.mock.config.js`

> The mock server (`dashboard/vite.mock.config.js`, launched via `.claude/launch.json` name `dashboard-mock` on port 5174) feeds fake data to the auth/sync/forecast/schedule endpoints for design preview. Extend it so Phase-1 components have data.

- [x] **Step 1:** In `buildMetrics()`, after each `day` is created, compute and attach a mock `readiness` and ensure `garmin` includes `stress_avg`, `hrv`. Then attach `meta.correlations`, `meta.ai_brief`, `meta.now`:
```js
// inside buildMetrics, when composing each day's garmin: add
hrv: Math.round(r(45, 70)),
// after the days loop, before `return`:
const ds = Object.values(days).sort((a,b)=>a.date.localeCompare(b.date));
for (const d of ds) {
  const g = d.garmin;
  const calm = 100 - g.stress_avg;
  const score = Math.round(0.35*g.sleep_score + 0.30*g.body_battery_max + 0.20*calm + 0.15*((g.hrv-57)/57*100+50));
  d.readiness = { score: Math.max(0,Math.min(100,score)), sleep:g.sleep_score, energy:g.body_battery_max, calm, hrv: Math.round((g.hrv-57)/57*100+50) };
}
return { days, meta: {
  generated: new Date().toISOString(),
  correlations: { labels:['Сон','Наст','Стр','Код','Шаг','BB'],
    matrix:[[1,.62,-.38,-.12,.15,.55],[.62,1,-.44,.28,.20,.40],[-.38,-.44,1,.41,-.10,-.50],[-.12,.28,.41,1,-.22,-.18],[.15,.20,-.10,-.22,1,.12],[.55,.40,-.50,-.18,.12,1]],
    strongest:[{a:'Сон',b:'Наст',r:.62},{a:'Стр',b:'BB',r:-.50},{a:'Код',b:'Стр',r:.41},{a:'Сон',b:'Стр',r:-.38}] },
  ai_brief: { text:'Сон 7.4ч поднял восстановление, стресс ниже нормы. Глубокой работы 6.2ч — выше обычного.', sources:['Garmin','GitHub','WakaTime','Obsidian'], generated_at:new Date().toISOString() },
  now: { activity:'coding', project:'omniroute', focus_min:41, source:'WakaTime' }
}};
```

- [x] **Step 2:** Start the mock server and confirm `curl -s localhost:5174/api/sync | python -m json.tool | grep readiness` shows the field.

- [x] **Step 3: Commit**

```bash
git add dashboard/vite.mock.config.js
git commit -m "test(dashboard): mock readiness/correlations/ai_brief/now"
```

### Task 1.5: Microcharts module (pure SVG/HTML builders)

**Files:**
- Create: `dashboard/src/components/microcharts.js`
- Create: `dashboard/test/microcharts.test.js`

- [x] **Step 1: Write failing tests**

`dashboard/test/microcharts.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { multiRing, rangeBar, stageBar, donut, sparkline, streakDots } from '../src/components/microcharts.js';

describe('microcharts', () => {
  it('multiRing renders 4 value arcs + center score', () => {
    const s = multiRing({ score: 76, factors: [
      { value: 82, color: '#5dc0a7' }, { value: 71, color: '#59be6c' },
      { value: 66, color: '#e2c162' }, { value: 58, color: '#69aed5' }] });
    expect(s).toContain('<svg');
    expect((s.match(/<circle/g) || []).length).toBe(8); // 4 tracks + 4 values
    expect(s).toContain('76');
  });
  it('rangeBar places a pin within the track', () => {
    const s = rangeBar({ value: 54, min: 50, max: 64, bandMin: 52, bandMax: 60, color: '#59be6c' });
    expect(s).toContain('class="track"');
    expect(s).toContain('pin');
  });
  it('stageBar emits one segment per phase', () => {
    const s = stageBar({ deep_h: 1, light_h: 4, rem_h: 2, awake_h: 0.5 });
    expect((s.match(/<i /g) || []).length).toBe(4);
  });
  it('donut and sparkline and streakDots return strings', () => {
    expect(donut([{ pct: 40, color: '#69aed5' }, { pct: 60, color: '#59be6c' }])).toContain('conic-gradient');
    expect(sparkline([1,2,3,2,4], '#5dc0a7')).toContain('<polyline');
    expect(streakDots([0,1,2,3,4])).toContain('commit-dot');
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `cd dashboard && npm test -- microcharts`
Expected: FAIL (module not found).

- [x] **Step 3: Implement**

`dashboard/src/components/microcharts.js`:
```js
/** Pure builders returning HTML/SVG strings. No DOM access — unit-testable. */

const TAU = 2 * Math.PI;

/** Concentric "Apple rings": composite score center + one ring per factor. */
export function multiRing({ score, factors, size = 128 }) {
  const c = size / 2;
  const radii = [56, 44, 32, 20];
  let arcs = '';
  factors.slice(0, 4).forEach((f, i) => {
    const r = radii[i];
    const circ = +(TAU * r).toFixed(1);
    const off = +(circ * (1 - (f.value ?? 0) / 100)).toFixed(1);
    arcs += `<circle cx="${c}" cy="${c}" r="${r}" stroke="rgba(255,255,255,.07)"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" stroke="${f.color}" stroke-dasharray="${circ}" stroke-dashoffset="${off}" transform="rotate(-90 ${c} ${c})"/>`;
  });
  return `<div class="mring" style="width:${size}px;height:${size}px">` +
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<g fill="none" stroke-width="8" stroke-linecap="round">${arcs}</g></svg>` +
    `<div class="ctr"><div><b>${score ?? '—'}</b><span>/ 100</span></div></div></div>`;
}

/** Today's value vs personal [min..max] with a normal band [bandMin..bandMax]. */
export function rangeBar({ value, min, max, bandMin, bandMax, color }) {
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  const left = pos(bandMin), right = `${100 - parseFloat(pos(bandMax))}%`;
  return `<div class="track"><div class="band" style="left:${left};right:${right}"></div>` +
    `<div class="fill" style="width:${pos(value)};background:${color}"></div>` +
    `<div class="pin" style="left:calc(${pos(value)} - 5px);background:${color}"></div></div>`;
}

export function stageBar({ deep_h = 0, light_h = 0, rem_h = 0, awake_h = 0 }) {
  const seg = (flex, c) => `<i style="flex:${flex || 0.0001};background:${c}"></i>`;
  return `<div class="stage">${seg(deep_h, '#3b5566')}${seg(light_h, 'var(--aqua)')}` +
    `${seg(rem_h, 'var(--blue)')}${seg(awake_h, 'var(--red)')}</div>`;
}

export function donut(segments, label = '') {
  let acc = 0, stops = [];
  for (const s of segments) { stops.push(`${s.color} ${acc}% ${acc + s.pct}%`); acc += s.pct; }
  return `<div class="donut" style="background:conic-gradient(${stops.join(',')})">` +
    (label ? `<div class="c">${label}</div>` : '') + `</div>`;
}

export function sparkline(values, color, w = 60, h = 17) {
  const vals = values.filter((v) => v != null);
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="fspark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}

export function streakDots(levels) {
  return `<div class="commit-dots-grid">` +
    levels.map((l) => `<div class="commit-dot commit-dot-${l}"></div>`).join('') + `</div>`;
}

/** Correlation heatmap from {labels, matrix}. Cells carry data-i/data-j for drilldown. */
export function heatmapMatrix({ labels, matrix }) {
  const head = `<div class="hlbl"></div>` + labels.map((l) => `<div class="hlbl">${l}</div>`).join('');
  let rows = '';
  matrix.forEach((row, i) => {
    rows += `<div class="hlbl row">${labels[i]}</div>`;
    row.forEach((r, j) => {
      if (i === j) { rows += `<div class="hc" style="background:rgba(255,255,255,.05);color:var(--fg-muted)">—</div>`; return; }
      if (r == null) { rows += `<div class="hc" style="background:rgba(255,255,255,.03)"></div>`; return; }
      const a = (Math.abs(r) * 0.5 + 0.08).toFixed(2);
      const c = r >= 0 ? `rgba(89,190,108,${a})` : `rgba(227,100,94,${a})`;
      const t = (r > 0 ? '.' : '-.') + Math.round(Math.abs(r) * 100);
      rows += `<div class="hc" data-i="${i}" data-j="${j}" style="background:${c}">${t}</div>`;
    });
  });
  return `<div class="hm">${head}${rows}</div>`;
}
```

- [x] **Step 4: Run to verify pass**

Run: `cd dashboard && npm test -- microcharts`
Expected: all pass.

- [x] **Step 5: Add microchart CSS** — append the rules for `.mring`, `.ctr`, `.track/.band/.fill/.pin`, `.stage`, `.donut`, `.fspark`, `.hm/.hc/.hlbl` to `dashboard/src/styles/main.css` (copy the matching selectors from `dashboard/public/mock-overview.html`'s `<style>` block; they are already authored there and palette-aligned).

- [x] **Step 6: Commit**

```bash
git add dashboard/src/components/microcharts.js dashboard/test/microcharts.test.js dashboard/src/styles/main.css
git commit -m "feat(dashboard): microcharts module + styles"
```

### Task 1.6: Hero component

**Files:**
- Create: `dashboard/src/components/Hero.js`
- Modify: `dashboard/index.html` (add `<section id="hero" class="hero2"></section>` as the first child of `#tab-dashboard`, replacing the old `stats-heatmap-row` — keep the old markup commented until Task 1.11)
- Modify: `dashboard/src/main.js` (import + call `renderHero`)

- [x] **Step 1:** Read `dashboard/public/mock-overview.html` hero section (`.hero2`) — it is the exact visual+DOM target. `Hero.js` must produce equivalent markup from real data.

- [x] **Step 2: Implement `renderHero(container, data)`**

`dashboard/src/components/Hero.js`:
```js
import { getDays } from '../utils/dataLoader.js';
import { multiRing, sparkline } from './microcharts.js';

const FACTORS = [
  { key: 'sleep', label: 'Сон', color: '#5dc0a7' },
  { key: 'energy', label: 'Энергия', color: '#59be6c' },
  { key: 'calm', label: 'Спокойствие', color: '#e2c162' },
  { key: 'hrv', label: 'HRV', color: '#69aed5' },
];

export function renderHero(container, data) {
  const days = getDays(data);
  const last = days[days.length - 1] || {};
  const rd = last.readiness || {};
  const scores = days.map((d) => d.readiness?.score).filter((v) => v != null);
  const avg30 = scores.slice(-30).length
    ? Math.round(scores.slice(-30).reduce((a, b) => a + b, 0) / scores.slice(-30).length) : null;
  const delta = (rd.score != null && avg30 != null) ? rd.score - avg30 : null;
  const brief = data.meta?.ai_brief;

  const rings = multiRing({ score: rd.score, factors: FACTORS.map((f) => ({ value: rd[f.key], color: f.color })) });

  const factorRows = FACTORS.map((f) => {
    const series = days.slice(-14).map((d) => d.readiness?.[f.key]).filter((v) => v != null);
    const spk = sparkline(series, f.color);
    const val = rd[f.key] ?? '—';
    return `<div class="frow"><i style="background:${f.color}"></i><span>${f.label}</span>${spk}<span class="fv">${val}</span></div>`;
  }).join('');

  const strip = days.slice(-14).map((d, i, a) => {
    const s = d.readiness?.score ?? 0;
    return `<i class="${i === a.length - 1 ? 'today' : ''}" style="height:${Math.max(8, s)}%"></i>`;
  }).join('');

  const deltaStr = delta == null ? '' :
    `<span style="color:${delta >= 0 ? 'var(--green)' : 'var(--red)'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs среднее 30д (${avg30})</span>`;

  container.className = 'hero2';
  container.innerHTML = `
    ${rings}
    <div class="sctx">
      <div>
        <div class="lbl">Состояние дня · composite</div>
        <div class="st">${statusLabel(rd.score)}</div>
        <div class="sd">${deltaStr}</div>
      </div>
      <div class="flegend">${factorRows}</div>
    </div>
    <div class="hcol">
      <div><div class="lbl" style="margin-bottom:6px">Готовность · 14 дней</div><div class="strip">${strip}</div></div>
      <div class="brief" style="border:none;background:none;padding:0">
        <div class="bh"><span class="lbl" style="color:var(--purple)">◇ AI-разбор дня</span><span class="more" data-drill="ai">развернуть →</span></div>
        <p style="font-size:.78rem">${brief?.text || 'Анализ появится после сбора данных.'}</p>
        <div class="chips">${(brief?.sources || []).map((s) => `<span class="src">${s}</span>`).join('')}</div>
      </div>
    </div>`;
}

function statusLabel(score) {
  if (score == null) return 'Нет данных';
  if (score >= 75) return 'Готов к нагрузке';
  if (score >= 55) return 'В норме';
  return 'Нужен отдых';
}
```

- [x] **Step 3: Wire in `main.js`** — import `{ renderHero }` and after `data` loads call `renderHero(document.getElementById('hero'), data)`.

- [x] **Step 4: Verify in preview** — start the `dashboard-mock` server, open `/` (the real app), confirm the hero renders rings + factors + 14d strip + brief and visually matches `mock-overview.html`'s hero. Capture a screenshot.

- [x] **Step 5: Commit**

```bash
git add dashboard/src/components/Hero.js dashboard/src/main.js dashboard/index.html dashboard/src/styles/main.css
git commit -m "feat(dashboard): readiness hero"
```

### Task 1.7: Live strip

**Files:**
- Create: `dashboard/src/components/LiveStrip.js`
- Modify: `dashboard/index.html` (add `<section id="liveStrip" class="live"></section>` under the hero)
- Modify: `dashboard/src/main.js`

- [x] **Step 1: Implement `renderLiveStrip(container, data, schedule)`** — 4 cells: «Сейчас» (`data.meta.now`), «По плану» (current block from `schedule`), «Инфра» (from latest docker pulse, default «—»), «Стрик кода» (`last.github?.streak` or `'—'`). Use the `.live/.lcell` markup from `mock-overview.html`.

```js
export function renderLiveStrip(container, data, schedule) {
  const now = data.meta?.now;
  const cur = schedule?.current;
  const last = Object.values(data.days).sort((a,b)=>a.date.localeCompare(b.date)).pop() || {};
  container.className = 'live';
  container.innerHTML = `
    <div class="lcell now"><div class="lbl">▸ Сейчас</div><div class="lv">${now ? `${now.activity} · ${now.project||''}` : '—'}</div><div class="ls">${now ? `фокус ${now.focus_min} мин · ${now.source}` : 'нет активности'}</div></div>
    <div class="lcell"><div class="lbl">По плану</div><div class="lv">${cur?.activity || '—'}</div><div class="ls">${cur ? `${cur.start}–${cur.end} · Obsidian` : 'свободно'}</div></div>
    <div class="lcell" id="liveInfra"><div class="lbl">Инфра</div><div class="lv"><span class="dot"></span>—</div><div class="ls">контейнеры · Docker</div></div>
    <div class="lcell"><div class="lbl">Стрик кода</div><div class="lv">${last.github?.streak ?? '—'} дн</div><div class="ls">GitHub</div></div>`;
}
```

- [x] **Step 2: Wire in `main.js`** (call after schedule fetch). Update `#liveInfra` inside the existing `socket.on('docker_pulse', …)` handler to show `okCount/total`.

- [x] **Step 3: Verify in preview + screenshot.**

- [x] **Step 4: Commit**

```bash
git add dashboard/src/components/LiveStrip.js dashboard/src/main.js dashboard/index.html
git commit -m "feat(dashboard): live strip"
```

### Task 1.8: Domain cards (Body / Mind / Work)

**Files:**
- Create: `dashboard/src/components/Domains.js`
- Modify: `dashboard/index.html` (add `<section id="domains" class="domains"></section>`)
- Modify: `dashboard/src/main.js`

- [x] **Step 1: Implement a data-driven `renderDomains(container, data)`** — one config-driven renderer producing the 3 `.dom` cards exactly like `mock-overview.html`. Each domain declares: name, source tag, primary `{value,unit,delta}`, a "primary viz" builder (stageBar / sparkline / donut), and `subs` (each a `rangeBar` or text). Pull values from the latest day; ranges from the metric's 30-day min/max; bands are personal norms (sleep 7–9h etc.).

```js
import { getDays } from '../utils/dataLoader.js';
import { stageBar, donut, sparkline, rangeBar } from './microcharts.js';

const minmax = (days, fn) => { const v = days.map(fn).filter(x=>x!=null); return v.length?{min:Math.min(...v),max:Math.max(...v)}:{min:0,max:1}; };

export function renderDomains(container, data) {
  const days = getDays(data); const d = days[days.length-1] || {};
  const g = d.garmin||{}, wk = d.wakatime, gh = d.github;

  // BODY
  const bodyRanges = {
    hr: minmax(days, x=>x.garmin?.resting_hr),
    spo2: minmax(days, x=>x.garmin?.spo2_avg),
    bb: minmax(days, x=>x.garmin?.body_battery_max),
  };
  const body = `
    <div class="dom" data-drill="body"><div class="dh"><span class="nm">Тело</span><span class="src">Garmin</span><span class="more">развернуть →</span></div>
    <div class="db">
      <div class="prim"><span class="pv" style="color:var(--aqua)">${g.sleep_hours??'—'}</span><span class="pu">ч сна</span></div>
      ${stageBar(g.sleep_phases||{})}
      <div class="legend"><span style="--c:#3b5566">Глубокий</span><span style="--c:var(--aqua)">Лёгкий</span><span style="--c:var(--blue)">REM</span><span style="--c:var(--red)">Бодр.</span></div>
      <div class="subs">
        ${subRow('Пульс покоя', g.resting_hr, bodyRanges.hr, '#59be6c')}
        ${subRow('SpO₂', g.spo2_avg!=null?g.spo2_avg+'%':null, bodyRanges.spo2, '#69aed5', g.spo2_avg)}
        ${subRow('Body Battery', g.body_battery_max, bodyRanges.bb, '#59be6c')}
      </div></div></div>`;

  // MIND
  const moodSeries = days.slice(-14).map(x=>x.manual?.mood);
  const corr = (data.meta?.correlations?.strongest||[]).find(c=>(c.a==='Сон'&&c.b==='Наст')||(c.a==='Наст'&&c.b==='Сон'));
  const mind = `
    <div class="dom" data-drill="mind"><div class="dh"><span class="nm">Разум</span><span class="src">Obsidian · Garmin</span><span class="more">развернуть →</span></div>
    <div class="db">
      <div class="prim"><span class="pv" style="color:var(--yellow)">${d.manual?.mood??'—'}</span><span class="pu">/ 5 настроение</span></div>
      <div class="spark-wrap">${sparkline(moodSeries.filter(v=>v!=null),'#c88ec3',300,34).replace('fspark','spark-svg')}</div>
      <div class="subs">
        ${subRow('Стресс ср', g.stress_avg, minmax(days,x=>x.garmin?.stress_avg), '#e2c162')}
        ${subRow('Фокус', wk?.focus_h!=null?wk.focus_h+'ч':null, {min:0,max:8}, '#59be6c', wk?.focus_h)}
        <div class="sub"><span class="sl">Связь</span><div class="track" style="background:none"><span style="font-family:var(--mono);font-size:.58rem;color:var(--fg-muted)">сон↔настроение r=${corr?corr.r:'—'}</span></div><span class="sv" style="color:var(--green)">↗</span></div>
      </div></div></div>`;

  // WORK
  const langs = wk?.by_language || {};
  const total = Object.values(langs).reduce((a,b)=>a+b,0) || 1;
  const palette = ['#69aed5','#e2c162','#5dc0a7','#e99355'];
  const segs = Object.entries(langs).slice(0,4).map(([,h],i)=>({pct:h/total*100,color:palette[i]}));
  const work = `
    <div class="dom" data-drill="work"><div class="dh"><span class="nm">Работа</span><span class="src">${wk?'WakaTime · ':''}GitHub</span><span class="more">развернуть →</span></div>
    <div class="db">
      <div class="prim"><span class="pv" style="color:var(--green)">${wk?.total_h ?? d.git?.commits ?? '—'}</span><span class="pu">${wk?'ч кода':'коммитов'}</span></div>
      ${segs.length?`<div class="donutrow">${donut(segs, (wk.total_h||'')+'ч')}<div class="langs">${Object.entries(langs).slice(0,4).map(([n,h],i)=>`<span class="lang" style="--c:${palette[i]}">${n} · ${h}ч</span>`).join('')}</div></div>`:''}
      <div class="subs">
        ${subRow('Коммиты', d.git?.commits, {min:0,max:20}, '#59be6c')}
        ${subRow('PR смержено', gh?.prs_merged, {min:0,max:8}, '#69aed5')}
        ${subRow('Deep-work', d.schedule?.hours_work!=null?d.schedule.hours_work+'ч':null, {min:0,max:8}, '#59be6c', d.schedule?.hours_work)}
      </div></div></div>`;

  container.className = 'domains';
  container.innerHTML = body + mind + work;
}

function subRow(label, displayVal, range, color, rawVal) {
  const v = rawVal != null ? rawVal : (typeof displayVal === 'number' ? displayVal : null);
  const bar = v == null ? '<div class="track"></div>'
    : rangeBar({ value: v, min: range.min, max: range.max,
        bandMin: range.min + (range.max-range.min)*0.25, bandMax: range.min + (range.max-range.min)*0.8, color });
  return `<div class="sub"><span class="sl">${label} <span class="info">i</span></span>${bar}<span class="sv">${displayVal ?? '—'}</span></div>`;
}
```

- [x] **Step 2: Wire in `main.js`**, add CSS for `.spark-wrap .spark-svg{width:100%;height:34px}` (or reuse `.spark`).

- [x] **Step 3: Verify in preview** — three domains match the mockup; sub-rows show range bars. Screenshot.

- [x] **Step 4: Commit**

```bash
git add dashboard/src/components/Domains.js dashboard/src/main.js dashboard/index.html dashboard/src/styles/main.css
git commit -m "feat(dashboard): domain cards (body/mind/work)"
```

### Task 1.9: Correlation panel (matrix + strongest links)

**Files:**
- Create: `dashboard/src/components/CorrelationPanel.js`
- Modify: `dashboard/index.html` (add bottom `<section class="bottom"><div class="panel" id="corrPanel"></div><div class="panel" id="trendsPanel"></div></section>`)
- Modify: `dashboard/src/main.js`

- [x] **Step 1: Implement `renderCorrelationPanel(container, data)`** using `heatmapMatrix` + a strongest-links list from `data.meta.correlations`. Markup mirrors `mock-overview.html`'s "Корреляции" panel (`.hmwrap` → `.hm` + `.corr-list`). Add `data-i/data-j` cell click handler that calls `window.__openAnalytics?.('corr', {i,j})` (wired in Phase 4).

```js
import { heatmapMatrix } from './microcharts.js';
const HINT = { 'Сон|Наст':'крепче спишь — лучше день', 'Стр|BB':'стресс садит body battery', 'Код|Стр':'длинные сессии повышают стресс', 'Сон|Стр':'недосып → выше стресс днём' };
export function renderCorrelationPanel(container, data) {
  const c = data.meta?.correlations; if (!c) { container.innerHTML=''; return; }
  const items = c.strongest.map(s => {
    const sign = s.r>=0?'pos':'neg'; const txt = HINT[`${s.a}|${s.b}`]||HINT[`${s.b}|${s.a}`]||'';
    return `<div class="corr-item"><span class="ci-r ${sign}">${s.r>0?'+':''}${s.r}</span><div><b>${s.a} → ${s.b}</b><div class="cx">${txt}</div></div></div>`;
  }).join('');
  container.innerHTML = `<h3>Корреляции <span class="more" data-drill="corr" style="margin-left:auto">открыть в Аналитике →</span></h3>
    <div class="hmwrap">${heatmapMatrix(c)}<div class="corr-list"><div class="lbl">Сильнейшие связи</div>${items}</div></div>`;
  container.querySelectorAll('.hc[data-i]').forEach(el =>
    el.addEventListener('click', () => window.__openAnalytics?.('corr', { i:+el.dataset.i, j:+el.dataset.j })));
}
```

- [x] **Step 2: Wire + CSS** (`.hmwrap/.corr-list/.corr-item/.ci-r` from the mockup).

- [x] **Step 3: Verify + screenshot.**

- [x] **Step 4: Commit**

```bash
git add dashboard/src/components/CorrelationPanel.js dashboard/src/main.js dashboard/index.html dashboard/src/styles/main.css
git commit -m "feat(dashboard): correlation panel"
```

### Task 1.10: Overview trends chart

**Files:**
- Create: `dashboard/src/components/OverviewTrends.js`
- Modify: `dashboard/src/main.js`

- [x] **Step 1: Implement `renderOverviewTrends(canvasOrContainer, data)`** — a Chart.js line chart with 3 gradient-filled series (Настроение / Сон / Энергия) over the last 30 days, mono ticks, a "today" annotation. Reuse the styling approach in `dashboard/src/components/TrendChart.js` and the palette from `utils/palette.js` (`PAL`, `TOOLTIP`, `initChartTheme`). Insert a `<canvas id="overviewTrends">` into `#trendsPanel` with a `<h3>` header.

- [x] **Step 2: Verify** the chart fills the right-hand panel and is not empty; toggling tabs and back still renders (rely on the Phase-1 visible tab; deep tabs handled in Phase 4).

- [x] **Step 3: Commit**

```bash
git add dashboard/src/components/OverviewTrends.js dashboard/src/main.js dashboard/index.html
git commit -m "feat(dashboard): overview trends chart"
```

### Task 1.11: Remove old Overview blocks + tab restructure

**Files:**
- Modify: `dashboard/index.html`, `dashboard/src/main.js`, `dashboard/src/styles/main.css`

- [x] **Step 1:** Remove the now-replaced old Overview markup (`stats-heatmap-row`, old `charts-row` if superseded) and the dead JS calls (`renderStatCards`, old heatmap on overview) — keep `MoodHeatmap`/`StatCards` modules for reuse in Analytics (Phase 4).
- [x] **Step 2:** Restructure tabs: group `LibreChat / Guacamole / OmniRoute` under a single **"Приложения ▾"** dropdown button; keep `Обзор / Аналитика / Инфраструктура` as primary tabs. Implement a minimal dropdown (click toggles a menu listing the three app tabs; selecting one activates the corresponding `tab-content`).
- [x] **Step 3: Verify** the Overview now shows only the new content; the apps dropdown switches to each iframe tab; no console errors (`preview_console_logs` level=error).
- [x] **Step 4: Commit**

```bash
git add dashboard/index.html dashboard/src/main.js dashboard/src/styles/main.css
git commit -m "refactor(dashboard): new overview layout + apps dropdown"
```

**Phase 1 acceptance:** Overview renders hero + live + 3 domains + correlation panel + trends from `metrics.json`; mock server screenshot matches `mock-overview.html`; `npm test` and `pytest` green; no console errors.

---

# PHASE 2 — New collectors: WakaTime, GitHub-deep, CI

**Outcome:** Real coding stats (Work domain + live "Сейчас"), GitHub PR/review/streak, CI status. Day objects gain `wakatime`, `github`; `meta.now` is real.

### Task 2.1: WakaTime source

**Files:**
- Create: `collector/sources/wakatime_source.py`
- Create: `collector/tests/test_wakatime_source.py`
- Modify: `.env.example` (add `WAKATIME_API_KEY=`)

- [x] **Step 1: Write failing test** (mock HTTP with `responses`):

`collector/tests/test_wakatime_source.py`:
```python
import responses
from collector.sources.wakatime_source import fetch_day

@responses.activate
def test_fetch_day_parses_languages_and_focus():
    responses.add(responses.GET,
        "https://wakatime.com/api/v1/users/current/summaries",
        json={"data": [{
            "grand_total": {"total_seconds": 17280},  # 4.8h
            "languages": [{"name": "TypeScript", "total_seconds": 6840},
                          {"name": "Python", "total_seconds": 4680}],
            "projects":  [{"name": "omniroute", "total_seconds": 9000}],
        }]}, status=200)
    out = fetch_day("2026-06-04", api_key="k")
    assert out["total_h"] == 4.8
    assert out["by_language"]["TypeScript"] == 1.9
    assert out["by_project"]["omniroute"] == 2.5
    assert "focus_h" in out
```

- [x] **Step 2: Run → FAIL.** `cd collector && python -m pytest tests/test_wakatime_source.py -v`

- [x] **Step 3: Implement**

`collector/sources/wakatime_source.py`:
```python
"""WakaTime daily coding summary. Docs: https://wakatime.com/developers"""
import base64, requests

BASE = "https://wakatime.com/api/v1/users/current/summaries"

def _h(sec): return round(sec / 3600, 1)

def fetch_day(date, api_key, timeout=15):
    auth = base64.b64encode(f"{api_key}:".encode()).decode()
    r = requests.get(BASE, params={"start": date, "end": date},
                     headers={"Authorization": f"Basic {auth}"}, timeout=timeout)
    r.raise_for_status()
    data = (r.json().get("data") or [{}])[0]
    total = data.get("grand_total", {}).get("total_seconds", 0)
    langs = {l["name"]: _h(l["total_seconds"]) for l in data.get("languages", []) if l["total_seconds"] > 60}
    projs = {p["name"]: _h(p["total_seconds"]) for p in data.get("projects", []) if p["total_seconds"] > 60}
    return {"total_h": _h(total),
            "by_language": dict(sorted(langs.items(), key=lambda kv: -kv[1])),
            "by_project": dict(sorted(projs.items(), key=lambda kv: -kv[1])),
            "focus_h": _h(total)}  # refine with heartbeat gaps later if desired
```

- [x] **Step 4: Run → PASS.**

- [x] **Step 5: Commit**

```bash
git add collector/sources/wakatime_source.py collector/tests/test_wakatime_source.py .env.example
git commit -m "feat(collector): wakatime source"
```

### Task 2.2: GitHub-deep source

**Files:**
- Create: `collector/sources/github_source.py`
- Create: `collector/tests/test_github_source.py`
- Modify: `.env.example` (`GITHUB_TOKEN=`, `GITHUB_USER=`)

- [x] **Step 1: Write failing test** using `responses` to mock the GitHub search API for merged PRs and reviews for a date, asserting the returned shape `{prs_merged, reviews, streak, langs, additions, deletions}`. (Streak may be derived across days in `run_collect`; here assert `prs_merged`/`reviews` parse correctly.)
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** `fetch_day(date, token, user)` calling:
  - `GET https://api.github.com/search/issues?q=type:pr+author:{user}+merged:{date}` → `prs_merged = total_count`.
  - `GET https://api.github.com/search/issues?q=type:pr+reviewed-by:{user}+updated:{date}` → `reviews`.
  - languages/additions/deletions are optional (leave `langs={}`, `additions/deletions=None`) unless a repo list is configured.
  Headers: `Authorization: Bearer {token}`, `Accept: application/vnd.github+json`. Handle 403 rate-limit by returning zeros.
- [x] **Step 4: Run → PASS.**
- [x] **Step 5: Commit** `feat(collector): github-deep source`.

### Task 2.3: CI source

**Files:**
- Create: `collector/sources/ci_source.py`
- Create: `collector/tests/test_ci_source.py`

- [x] **Step 1: Write failing test** mocking `GET https://api.github.com/repos/{owner}/{repo}/actions/runs?per_page=1` → asserts `fetch_status(repo)` returns `{repo, status, conclusion, updated_at}`.
- [x] **Step 2–4: Implement + pass.** `fetch_all(repos, token)` → list of statuses; tolerate missing repos.
- [x] **Step 5: Commit** `feat(collector): ci status source`.

### Task 2.4: Integrate Phase-2 sources into `run_collect.py`

**Files:**
- Modify: `collector/run_collect.py`

- [x] **Step 1:** For each collected day, call `wakatime_source.fetch_day` and `github_source.fetch_day` (guarded by env keys; skip gracefully if absent) and attach `day["wakatime"]`, `day["github"]`. Derive `github.streak` = consecutive trailing days with `commits>0`.
- [x] **Step 2:** Set `meta["now"]` from today's WakaTime top project + `meta["ci"]` from `ci_source.fetch_all`.
- [x] **Step 3:** Run collector with real keys; verify `metrics.json` has `wakatime`/`github` and `meta.now/ci`. Recompute correlations (the `Код` metric now uses `wakatime.total_h`).
- [x] **Step 4: Commit** `feat(collector): integrate wakatime/github/ci into collection`.

### Task 2.5: Frontend consumes real Work/now data

**Files:** Modify `dashboard/src/components/Domains.js`, `LiveStrip.js` — already read `wakatime`/`github`/`meta.now` (Phase 1 wrote defensive accessors). Verify with the mock (already provides these) and, if available, against real `/api/sync`.

- [x] **Step 1: Verify** Work domain shows the language donut and PR/streak; live "Сейчас" shows the real project. Screenshot.
- [x] **Step 2: Commit** (only if changes were needed) `fix(dashboard): wire real wakatime/github fields`.

**Phase 2 acceptance:** With keys set, Work domain + live strip reflect real coding activity; collector tests green.

---

# PHASE 3 — AI insights (self-hosted LLM)

**Outcome:** `meta.ai_brief` is generated by the user's LLM from the day's numbers + correlations, with cited sources. Brief is cached in `metrics.json` (regenerated each collector run).

### Task 3.1: AI insights generator

**Files:**
- Create: `collector/ai_insights.py`
- Create: `collector/tests/test_ai_insights.py`
- Modify: `.env.example` (`LLM_BASE_URL=`, `LLM_API_KEY=`, `LLM_MODEL=`)

- [ ] **Step 1: Write failing test** that mocks the OpenAI-compatible `POST {LLM_BASE_URL}/chat/completions` (via `responses`) and asserts `generate_brief(days, correlations)` returns `{text, sources, generated_at}` with `text` taken from the mocked completion and `sources` listing the data sources present.
```python
import responses
from collector.ai_insights import generate_brief

@responses.activate
def test_generate_brief_uses_llm():
    responses.add(responses.POST, "http://llm.local/v1/chat/completions",
        json={"choices": [{"message": {"content": "Хороший день."}}]}, status=200)
    days = [{"garmin": {"sleep_hours": 7.4}, "wakatime": {"total_h": 4.8}, "manual": {"mood": 4}}]
    out = generate_brief(days, {"strongest": [{"a":"Сон","b":"Наст","r":0.62}]},
                         base_url="http://llm.local/v1", api_key="k", model="m")
    assert out["text"] == "Хороший день."
    assert "Garmin" in out["sources"] and "WakaTime" in out["sources"]
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`collector/ai_insights.py`:
```python
"""Daily brief via an OpenAI-compatible self-hosted LLM (LibreChat backend)."""
import datetime, requests

SYS = ("Ты — лаконичный ассистент личного дашборда. По числам дня и корреляциям "
       "напиши 1–2 предложения по-русски: что хорошо/плохо и почему. Без воды, "
       "без выдуманных данных. Опирайся только на переданные числа.")

def _sources(day):
    m = {"garmin": "Garmin", "github": "GitHub", "wakatime": "WakaTime", "manual": "Obsidian"}
    return [label for key, label in m.items() if day.get(key)]

def generate_brief(days, correlations, base_url, api_key, model, timeout=30):
    today = days[-1] if days else {}
    payload = {"model": model, "temperature": 0.4, "messages": [
        {"role": "system", "content": SYS},
        {"role": "user", "content": _prompt(today, correlations)}]}
    r = requests.post(f"{base_url}/chat/completions", json=payload,
                      headers={"Authorization": f"Bearer {api_key}"}, timeout=timeout)
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"].strip()
    return {"text": text, "sources": _sources(today),
            "generated_at": datetime.datetime.utcnow().isoformat() + "Z"}

def _prompt(day, correlations):
    g = day.get("garmin", {}); wk = day.get("wakatime", {})
    facts = [f"сон {g.get('sleep_hours')}ч", f"оценка сна {g.get('sleep_score')}",
             f"body battery {g.get('body_battery_max')}", f"стресс {g.get('stress_avg')}",
             f"настроение {day.get('manual',{}).get('mood')}/5",
             f"код {wk.get('total_h')}ч", f"коммиты {day.get('git',{}).get('commits')}"]
    top = "; ".join(f"{c['a']}↔{c['b']} r={c['r']}" for c in correlations.get("strongest", [])[:3])
    return "Числа дня: " + ", ".join(str(f) for f in facts) + ". Корреляции: " + top + "."
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(collector): ai daily brief generator`.

### Task 3.2: Wire brief into `run_collect.py`

**Files:** Modify `collector/run_collect.py`

- [ ] **Step 1:** After correlations are built, if LLM env vars are set, call `generate_brief(ordered, meta["correlations"], …)` and store `meta["ai_brief"]`. Wrap in try/except → on failure keep a templated fallback brief (no crash).
- [ ] **Step 2: Verify** `metrics.json` `meta.ai_brief.text` is populated; the hero brief shows it.
- [ ] **Step 3: Commit** `feat(collector): attach ai brief to meta`.

**Phase 3 acceptance:** Hero AI brief shows LLM-generated text with correct source chips; collector never crashes if the LLM is unreachable.

---

# PHASE 4 — Analytics deep-view + drill-down wiring

**Outcome:** Every "развернуть →" / metric click / matrix cell opens the Analytics tab focused on the relevant data; full per-domain charts + large matrix + scatter on cell click; tooltips show source.

### Task 4.1: Analytics deep-view component

**Files:**
- Create: `dashboard/src/components/AnalyticsDeep.js`
- Modify: `dashboard/index.html` (Analytics sub-tabs: Тело / Разум / Работа / Корреляции), `dashboard/src/main.js`

- [ ] **Step 1:** Implement sub-tab views: **Тело** (sleep stages history, HR/SpO₂/BB lines — reuse `HealthCharts.js`), **Разум** (mood + stress overlay), **Работа** (coding hours by language stacked, commits/PRs), **Корреляции** (large `heatmapMatrix` + a scatter rendered with Chart.js for a selected pair).
- [ ] **Step 2:** Lazy-render on first open (follow the existing `healthLoaded` pattern in `main.js`).
- [ ] **Step 3: Verify** each sub-tab fills with the new palette and is not empty after switching tabs. Screenshot.
- [ ] **Step 4: Commit** `feat(dashboard): analytics deep-view`.

### Task 4.2: Drill-down + tooltips + source links

**Files:** Modify `dashboard/src/main.js`, `dashboard/src/components/AnalyticsDeep.js`, `dashboard/src/utils/tooltip.js`

- [ ] **Step 1:** Implement `window.__openAnalytics(target, params)` — switches to the Analytics tab, activates the matching sub-tab, and (for `corr`) selects the `{i,j}` scatter. Bind all `[data-drill]` elements (hero "развернуть", domain "развернуть", matrix cells) to it in `main.js`.
- [ ] **Step 2:** Add hover tooltips to every `.sub` / `.hc` showing `value · avg · range · source` using the existing global tooltip system (`utils/tooltip.js`); make `.src` chips link to the source where a URL exists (GitHub profile, etc.).
- [ ] **Step 3: Verify** clicking a domain "развернуть" lands on the right sub-tab; hovering a sub-row shows the source tooltip. Screenshot the open state.
- [ ] **Step 4: Commit** `feat(dashboard): drill-down + source tooltips`.

**Phase 4 acceptance:** Drill-downs navigate correctly; tooltips show source/avg/range; matrix cell opens its scatter.

---

# PHASE 5 — Live "now" + polish + mobile

**Outcome:** Real-time "Сейчас" via socket; clean empty states; responsive layout; temp files removed.

### Task 5.1: `now_pulse` socket

**Files:** Modify `api/server.js`, `dashboard/src/main.js`

- [ ] **Step 1:** Read `api/server.js` to match its socket.io + auth pattern. Add a server-side interval (e.g., every 60s) that reads today's WakaTime "Сейчас" (top project + minutes; reuse the collector's WakaTime logic or call a small Node fetch) and `io.emit('now_pulse', {...})`. Guard with the same auth used by `docker_pulse`.
- [ ] **Step 2:** In `main.js`, `socket.on('now_pulse', s => updateLiveNow(s))` updating the live-strip "Сейчас" cell in place.
- [ ] **Step 3: Verify** the live cell updates without reload (simulate by emitting from the server). 
- [ ] **Step 4: Commit** `feat: live now_pulse for current activity`.

### Task 5.2: Empty states + responsive + cleanup

**Files:** Modify `dashboard/src/styles/main.css`, components; delete temp files.

- [ ] **Step 1:** Add tasteful empty states ("Нет данных за день", "Сбор начнётся ночью") for missing readiness/brief/domains instead of bare "—".
- [ ] **Step 2:** Add responsive rules: hero stacks vertically, domains become 1 column, bottom panels stack, at `max-width: 1000px` and `700px`. Verify with `preview_resize` presets `tablet` and `mobile`.
- [ ] **Step 3:** Remove temporary scaffolding: `dashboard/vite.mock.config.js`, `.claude/launch.json`, `dashboard/public/mock-approaches.html`, `dashboard/public/mock-overview.html`. Remove the `--no-save`-installed `socket.io-client` only if it was already a real dependency (it is — keep it).
- [ ] **Step 4:** Final pass: `cd dashboard && npm test`, `cd collector && python -m pytest`, `cd dashboard && npm run build` all green; no console errors in preview.
- [ ] **Step 5: Commit** `feat: empty states, responsive, cleanup`.

**Phase 5 acceptance:** Live "Сейчас" updates over socket; mobile/tablet layouts hold; build passes; temp files gone.

---

## Self-Review (performed against the spec)

- **Spec coverage:** IA tabs → Task 1.11 + 4.1; hero/score → 1.2,1.6; transparency/drill-down → 1.9,4.2; domains → 1.8; correlations → 1.2,1.9,4.1; trends → 1.10; collectors WakaTime/GitHub/CI → 2.1–2.4; AI insights → 3.1–3.2; data model §7 → collectors write fields, frontend reads; API/realtime §8 → 5.1; visual system §9 → already done (Phase 0); microcharts §10 → 1.5. Open questions §12 are explicitly deferred to in-task tuning (weights in 1.2, compute location resolved as collector-side, CI source in 2.3, apps dropdown in 1.11, correlation window = last 30 in 1.3).
- **Placeholder scan:** Logic-heavy tasks (1.2, 1.5, 1.6, 1.8, 1.9, 2.1, 3.1) carry full code. Tasks 2.2/2.3/4.x/5.x give exact endpoints, signatures, file paths and acceptance criteria rather than full bodies where the pattern is mechanical — the implementing agent has enough to write them without guessing intent. No "TBD/handle edge cases" left.
- **Type/name consistency:** `compute_readiness`/`build_correlations`/`pearson` (1.2) are imported identically in 1.3/3.2; `multiRing/rangeBar/stageBar/donut/sparkline/streakDots/heatmapMatrix` (1.5) are the names used in 1.6/1.8/1.9; `fetch_day` shape `{total_h,by_language,by_project,focus_h}` (2.1) matches Domains' accessors (1.8); `meta.now/correlations/ai_brief` keys match between mock (1.4), collector (1.3/2.4/3.2) and frontend (1.6/1.7/1.9). `window.__openAnalytics(target, params)` defined in 4.2 matches the call site in 1.9.
