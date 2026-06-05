"""Pure derived-metric calculations: readiness and correlations."""

from statistics import mean, pstdev


WEIGHTS = {"sleep": 0.35, "energy": 0.30, "calm": 0.20, "hrv": 0.15}


def _clamp(value, lo=0, hi=100):
    return max(lo, min(hi, value))


def compute_readiness(day, hrv_baseline=None):
    """Return a transparent Day Readiness score from available Garmin factors."""
    garmin = (day or {}).get("garmin") or {}

    sleep = garmin.get("sleep_score")
    energy = garmin.get("body_battery_max")
    stress = garmin.get("stress_avg")
    calm = None if stress is None else _clamp(100 - stress)

    hrv_raw = garmin.get("hrv")
    if hrv_raw is None or not hrv_baseline:
        hrv = None
    else:
        hrv = _clamp(round(50 + (hrv_raw - hrv_baseline) / hrv_baseline * 100))

    factors = {"sleep": sleep, "energy": energy, "calm": calm, "hrv": hrv}
    present = {key: value for key, value in factors.items() if value is not None}

    if not present:
        score = None
    else:
        weight_sum = sum(WEIGHTS[key] for key in present)
        score = round(sum(WEIGHTS[key] * value for key, value in present.items()) / weight_sum)

    return {"score": score, **factors}


def pearson(xs, ys):
    """Pearson r over paired non-null values."""
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 3:
        return None

    xa = [pair[0] for pair in pairs]
    ya = [pair[1] for pair in pairs]
    sx = pstdev(xa)
    sy = pstdev(ya)
    if sx == 0 or sy == 0:
        return None

    mx = mean(xa)
    my = mean(ya)
    cov = mean((x - mx) * (y - my) for x, y in pairs)
    return round(cov / (sx * sy), 2)


CORR_METRICS = [
    ("Сон", lambda day: (day.get("garmin") or {}).get("sleep_hours")),
    ("Наст", lambda day: (day.get("manual") or {}).get("mood")),
    ("Стр", lambda day: (day.get("garmin") or {}).get("stress_avg")),
    (
        "Код",
        lambda day: (day.get("wakatime") or {}).get("total_h")
        or (day.get("schedule") or {}).get("hours_work"),
    ),
    ("Шаг", lambda day: (day.get("garmin") or {}).get("steps")),
    ("BB", lambda day: (day.get("garmin") or {}).get("body_battery_max")),
]


def build_correlations(days):
    labels = [label for label, _ in CORR_METRICS]
    columns = [[extractor(day) for day in days] for _, extractor in CORR_METRICS]

    matrix = []
    for i in range(len(labels)):
        row = []
        for j in range(len(labels)):
            row.append(1.0 if i == j else pearson(columns[i], columns[j]))
        matrix.append(row)

    strongest = []
    for i in range(len(labels)):
        for j in range(i + 1, len(labels)):
            r = matrix[i][j]
            if r is not None:
                strongest.append({"a": labels[i], "b": labels[j], "r": r})

    strongest.sort(key=lambda item: abs(item["r"]), reverse=True)
    return {"labels": labels, "matrix": matrix, "strongest": strongest[:4]}
