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
