import json
import sys
from types import SimpleNamespace

from collector import run_collect


def test_main_attaches_readiness_and_correlations(tmp_path, monkeypatch):
    metrics_path = tmp_path / "metrics.json"
    monkeypatch.setattr(run_collect, "METRICS_PATH", str(metrics_path))
    for name in (
        "WAKATIME_API_KEY",
        "GITHUB_TOKEN",
        "GITHUB_USER",
        "CI_REPOS",
        "GITHUB_CI_REPOS",
        "LLM_BASE_URL",
        "LLM_API_KEY",
        "LLM_MODEL",
    ):
        monkeypatch.delenv(name, raising=False)

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


def test_main_integrates_phase2_sources(tmp_path, monkeypatch):
    metrics_path = tmp_path / "metrics.json"
    monkeypatch.setattr(run_collect, "METRICS_PATH", str(metrics_path))
    monkeypatch.setenv("WAKATIME_API_KEY", "wk")
    monkeypatch.setenv("GITHUB_TOKEN", "gh")
    monkeypatch.setenv("GITHUB_USER", "ivan")
    monkeypatch.setenv("CI_REPOS", "owner/repo")

    def fake_collect_git(metrics, dates):
        for date_str in dates:
            day = run_collect.ensure_day(metrics, date_str)
            day["git"] = {"commits": 2, "repos": ["life-dashboard"]}
            day["garmin"] = {
                "sleep_score": 80,
                "sleep_hours": 7.4,
                "body_battery_max": 70,
                "stress_avg": 34,
                "steps": 8000,
            }
            day["manual"] = {"mood": 4}
            day["schedule"] = {"hours_work": 5}

    monkeypatch.setattr(run_collect, "collect_garmin", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_weather", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_git", fake_collect_git)
    monkeypatch.setattr(run_collect, "collect_schedules", lambda metrics, dates: None)

    wakatime_calls = []
    github_calls = []

    def fake_wakatime(date, api_key):
        wakatime_calls.append((date, api_key))
        return {
            "total_h": 2.5,
            "by_language": {"Python": 1.5},
            "by_project": {"life-dashboard": 2.5},
            "focus_h": 2.5,
        }

    def fake_github(date, token, user):
        github_calls.append((date, token, user))
        return {
            "prs_merged": 1,
            "reviews": 3,
            "streak": 0,
            "langs": {},
            "additions": None,
            "deletions": None,
        }

    monkeypatch.setitem(
        sys.modules,
        "sources.wakatime_source",
        SimpleNamespace(fetch_day=fake_wakatime),
    )
    monkeypatch.setitem(
        sys.modules,
        "sources.github_source",
        SimpleNamespace(fetch_day=fake_github),
    )
    monkeypatch.setitem(
        sys.modules,
        "sources.ci_source",
        SimpleNamespace(
            fetch_all=lambda repos, token: [
                {
                    "repo": repos[0],
                    "status": "completed",
                    "conclusion": "success",
                    "updated_at": "2026-06-04T10:15:00Z",
                }
            ]
        ),
    )

    run_collect.main()

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    ordered = [metrics["days"][date] for date in sorted(metrics["days"])]

    assert len(wakatime_calls) == 2
    assert len(github_calls) == 2
    assert all(day["wakatime"]["total_h"] == 2.5 for day in ordered)
    assert all(day["github"]["prs_merged"] == 1 for day in ordered)
    assert ordered[-1]["github"]["streak"] == 2
    assert metrics["meta"]["now"] == {
        "activity": "Код",
        "project": "life-dashboard",
        "focus_min": 150,
        "source": "WakaTime",
    }
    assert metrics["meta"]["ci"][0]["repo"] == "owner/repo"


def test_main_attaches_ai_brief_when_llm_env_set(tmp_path, monkeypatch):
    metrics_path = tmp_path / "metrics.json"
    monkeypatch.setattr(run_collect, "METRICS_PATH", str(metrics_path))
    monkeypatch.setenv("LLM_BASE_URL", "http://llm.local/v1")
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setenv("LLM_MODEL", "m")
    for name in ("WAKATIME_API_KEY", "GITHUB_TOKEN", "GITHUB_USER", "CI_REPOS", "GITHUB_CI_REPOS"):
        monkeypatch.delenv(name, raising=False)

    def fake_collect_garmin(metrics, dates):
        for date_str in dates:
            day = run_collect.ensure_day(metrics, date_str)
            day["garmin"] = {
                "sleep_score": 80,
                "sleep_hours": 7.4,
                "body_battery_max": 70,
                "stress_avg": 34,
            }
            day["manual"] = {"mood": 4}

    monkeypatch.setattr(run_collect, "collect_garmin", fake_collect_garmin)
    monkeypatch.setattr(run_collect, "collect_weather", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_git", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_schedules", lambda metrics, dates: None)

    calls = []

    def fake_generate_brief(days, correlations, base_url, api_key, model):
        calls.append((days, correlations, base_url, api_key, model))
        return {
            "text": "LLM увидел хороший день.",
            "sources": ["Garmin", "Obsidian"],
            "generated_at": "2026-06-04T10:15:00Z",
        }

    monkeypatch.setitem(
        sys.modules,
        "ai_insights",
        SimpleNamespace(generate_brief=fake_generate_brief),
    )

    run_collect.main()

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    assert calls
    assert calls[0][2:] == ("http://llm.local/v1", "k", "m")
    assert calls[0][1]["labels"] == ["Сон", "Наст", "Стр", "Код", "Шаг", "BB"]
    assert metrics["meta"]["ai_brief"]["text"] == "LLM увидел хороший день."
    assert metrics["meta"]["ai_brief"]["sources"] == ["Garmin", "Obsidian"]


def test_main_keeps_fallback_ai_brief_when_llm_fails(tmp_path, monkeypatch):
    metrics_path = tmp_path / "metrics.json"
    monkeypatch.setattr(run_collect, "METRICS_PATH", str(metrics_path))
    monkeypatch.setenv("LLM_BASE_URL", "http://llm.local/v1")
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setenv("LLM_MODEL", "m")
    for name in ("WAKATIME_API_KEY", "GITHUB_TOKEN", "GITHUB_USER", "CI_REPOS", "GITHUB_CI_REPOS"):
        monkeypatch.delenv(name, raising=False)

    def fake_collect_garmin(metrics, dates):
        for date_str in dates:
            day = run_collect.ensure_day(metrics, date_str)
            day["garmin"] = {"sleep_score": 80, "sleep_hours": 7.4}
            day["manual"] = {"mood": 4}

    monkeypatch.setattr(run_collect, "collect_garmin", fake_collect_garmin)
    monkeypatch.setattr(run_collect, "collect_weather", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_git", lambda metrics, dates: None)
    monkeypatch.setattr(run_collect, "collect_schedules", lambda metrics, dates: None)
    monkeypatch.setitem(
        sys.modules,
        "ai_insights",
        SimpleNamespace(generate_brief=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("down"))),
    )

    run_collect.main()

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    brief = metrics["meta"]["ai_brief"]
    assert "временно недоступен" in brief["text"]
    assert brief["sources"] == ["Garmin", "Obsidian"]
    assert brief["generated_at"].endswith("Z")
