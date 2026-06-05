import json

from collector import run_collect


def test_main_attaches_readiness_and_correlations(tmp_path, monkeypatch):
    metrics_path = tmp_path / "metrics.json"
    monkeypatch.setattr(run_collect, "METRICS_PATH", str(metrics_path))

    def fake_collect_garmin(metrics, dates):
        samples = [
            {
                "sleep_score": 80,
                "sleep_hours": 7.4,
                "body_battery_max": 70,
                "stress_avg": 34,
                "steps": 8000,
                "hrv": 58,
            },
            {
                "sleep_score": 76,
                "sleep_hours": 7.0,
                "body_battery_max": 66,
                "stress_avg": 38,
                "steps": 7000,
                "hrv": 54,
            },
        ]
        for date_str, garmin in zip(dates, samples):
            day = run_collect.ensure_day(metrics, date_str)
            day["garmin"] = garmin
            day["manual"] = {"mood": 4}
            day["schedule"] = {"hours_work": 5}

    monkeypatch.setattr(run_collect, "collect_garmin", fake_collect_garmin)
    monkeypatch.setattr(run_collect, "collect_weather", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_git", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_schedules", lambda metrics, dates: None)

    run_collect.main()

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    days = list(metrics["days"].values())
    assert all(day["readiness"]["score"] is not None for day in days)
    assert metrics["meta"]["correlations"]["labels"] == ["Сон", "Наст", "Стр", "Код", "Шаг", "BB"]
