"""Auto-found statistical findings for the Analytics lab.

Each finding: {type, title, subtitle, metrics, stat, evidence, explanation, sources}
- evidence drives the board: {view, x, y, annotations?}  (view in
  correlation|timeline|weekday|distribution)
Reuses pearson from metrics_calc; pure (no I/O).
"""

from collections import defaultdict
from statistics import mean, pstdev

try:
    from metrics_calc import pearson  # collector/ is on sys.path in run_collect
except ImportError:
    from collector.metrics_calc import pearson


_M = {
    "Сон": lambda d: (d.get("garmin") or {}).get("sleep_hours"),
    "Наст": lambda d: (d.get("manual") or {}).get("mood"),
    "Стр": lambda d: (d.get("garmin") or {}).get("stress_avg"),
    "Шаг": lambda d: (d.get("garmin") or {}).get("steps"),
    "Код": lambda d: (d.get("wakatime") or {}).get("total_h"),
    "Готов": lambda d: (d.get("readiness") or {}).get("score"),
}
_SRC = {
    "garmin": "Garmin",
    "wakatime": "WakaTime",
    "github": "GitHub",
    "git": "GitHub",
    "manual": "Obsidian",
}


def _sources(day):
    return sorted({label for key, label in _SRC.items() if (day or {}).get(key)})


def _col(days, label):
    fn = _M[label]
    return [fn(day or {}) for day in days]


def _f(type_, title, view, x, y, **kw):
    return {
        "type": type_,
        "title": title,
        "subtitle": kw.get("subtitle", ""),
        "metrics": [x, y] if y else [x],
        "stat": kw.get("stat"),
        "evidence": {
            "view": view,
            "x": x,
            "y": y,
            "annotations": kw.get("annotations", []),
        },
        "explanation": kw.get("explanation", ""),
        "sources": kw.get("sources", []),
    }


def _correlations(days):
    out = []
    labels = list(_M)
    for i, a in enumerate(labels):
        for b in labels[i + 1:]:
            r = pearson(_col(days, a), _col(days, b))
            if r is None or abs(r) < 0.4:
                continue
            out.append(_f(
                "correlation",
                f"{a} ↔ {b} · r={r:+.2f}",
                "correlation",
                a,
                b,
                stat=r,
                subtitle=f"|r|={abs(r):.2f}",
                explanation=f"{a} и {b} связаны (r={r:+.2f}).",
                sources=_sources(days[-1]),
            ))
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

    label, r = sorted(rs, key=lambda t: -abs(t[1]))[0]
    return [_f(
        "driver",
        f"Рычаг готовности — {label} ({r:+.2f})",
        "correlation",
        label,
        "Готов",
        stat=r,
        subtitle="сильнее всех",
        sources=_sources(days[-1]),
    )]


def _anomalies(days):
    vals = [(day or {}, ((day or {}).get("garmin") or {}).get("stress_avg")) for day in days]
    nums = [value for _, value in vals if value is not None]
    if len(nums) < 5:
        return []

    mu, sd = mean(nums), pstdev(nums)
    if sd == 0:
        return []

    out = []
    for day, value in vals:
        if value is None:
            continue
        z = (value - mu) / sd
        if z >= 2.0:
            date = day.get("date", "день")
            out.append(_f(
                "anomaly",
                f"{date} — стресс {value}, ×{value / mu:.1f} нормы",
                "timeline",
                "Стр",
                None,
                subtitle=f"σ +{z:.1f}",
                annotations=[{"date": date, "label": "аномалия"}],
                sources=_sources(day),
            ))
    return out[:1]


def _records(days):
    streak = best = 0
    for day in days:
        commits = ((day or {}).get("git") or {}).get("commits") or 0
        streak = streak + 1 if commits > 0 else 0
        best = max(best, streak)
    if best < 3:
        return []

    return [_f(
        "record",
        f"Стрик коммитов — {best} дней подряд",
        "timeline",
        "Код",
        None,
        stat=best,
        subtitle="текущий рекорд",
        sources=_sources(days[-1]),
    )]


def _patterns(days):
    by_wd = defaultdict(list)
    for day in days:
        day = day or {}
        sleep_hours = (day.get("garmin") or {}).get("sleep_hours")
        weekday = day.get("weekday")
        if sleep_hours is not None and weekday:
            by_wd[weekday].append(sleep_hours)
    if len(by_wd) < 5:
        return []

    weekend = [v for wd in ("Сб", "Вс") for v in by_wd.get(wd, [])]
    week = [v for wd in ("Пн", "Вт", "Ср", "Чт", "Пт") for v in by_wd.get(wd, [])]
    if not weekend or not week:
        return []

    diff = mean(weekend) - mean(week)
    if abs(diff) < 0.5:
        return []

    return [_f(
        "pattern",
        f"Выходные: сон {diff:+.1f}ч",
        "weekday",
        "Сон",
        None,
        stat=round(diff, 1),
        subtitle="по дням недели",
        sources=_sources(days[-1]),
    )]


def _thresholds(days):
    lo, hi = [], []
    for day in days:
        day = day or {}
        sleep_hours = (day.get("garmin") or {}).get("sleep_hours")
        work = (day.get("wakatime") or {}).get("total_h")
        if sleep_hours is None or work is None:
            continue
        (lo if sleep_hours < 6.5 else hi).append(work)
    if len(lo) < 3 or len(hi) < 3:
        return []

    normal_sleep_work, short_sleep_work = mean(hi), mean(lo)
    if normal_sleep_work == 0:
        return []

    pct = round((short_sleep_work - normal_sleep_work) / normal_sleep_work * 100)
    return [_f(
        "threshold",
        f"Сон <6.5ч → код {pct:+d}%",
        "distribution",
        "Сон",
        "Код",
        stat=pct,
        subtitle=f"≥6.5ч: {normal_sleep_work:.1f}ч · <6.5ч: {short_sleep_work:.1f}ч",
        sources=_sources(days[-1]),
    )]


def build_findings(days):
    """Return typed statistical findings for an ordered list of day dictionaries."""
    if not days:
        return []

    clean_days = [day or {} for day in days]
    out = []
    out += _correlations(clean_days)
    out += _thresholds(clean_days)
    out += _anomalies(clean_days)
    out += _records(clean_days)
    out += _patterns(clean_days)
    out += _drivers(clean_days)
    return out
