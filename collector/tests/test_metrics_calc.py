from collector.metrics_calc import build_correlations, compute_readiness, pearson


def test_readiness_full():
    day = {
        "garmin": {
            "sleep_score": 80,
            "body_battery_max": 70,
            "stress_avg": 34,
            "hrv": 58,
        }
    }

    r = compute_readiness(day, hrv_baseline=58)

    assert r["sleep"] == 80
    assert r["energy"] == 70
    assert r["calm"] == 66
    assert r["hrv"] == 50
    assert r["score"] == 70


def test_readiness_missing_factor_reweights():
    day = {"garmin": {"sleep_score": 80, "body_battery_max": 70, "stress_avg": 34}}

    r = compute_readiness(day, hrv_baseline=None)

    assert r["hrv"] is None
    expected = round((0.35 * 80 + 0.30 * 70 + 0.20 * 66) / 0.85)
    assert r["score"] == expected


def test_pearson_known():
    assert pearson([1, 2, 3, 4], [2, 4, 6, 8]) == 1.0
    assert pearson([1, 2, 3], [3, 2, 1]) == -1.0
    assert pearson([1, 1, 1], [1, 2, 3]) is None


def test_build_correlations_shape():
    days = [
        {
            "garmin": {"sleep_hours": h, "stress_avg": 50 - h},
            "manual": {"mood": min(5, h - 2)},
        }
        for h in range(4, 9)
    ]

    out = build_correlations(days)

    assert "matrix" in out
    assert "labels" in out
    assert "strongest" in out
    assert len(out["labels"]) == len(out["matrix"])
