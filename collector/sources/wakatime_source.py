"""WakaTime daily coding summaries."""

import base64

import requests


BASE_URL = "https://wakatime.com/api/v1/users/current/summaries"


def _hours(total_seconds):
    return round((total_seconds or 0) / 3600, 1)


def _hours_by_name(items):
    values = {
        item["name"]: _hours(item.get("total_seconds", 0))
        for item in items or []
        if item.get("name") and item.get("total_seconds", 0) > 60
    }
    return dict(sorted(values.items(), key=lambda kv: -kv[1]))


def fetch_day(date, api_key, timeout=15):
    """Fetch and normalize one WakaTime summary day."""
    auth = base64.b64encode(f"{api_key}:".encode("utf-8")).decode("ascii")
    response = requests.get(
        BASE_URL,
        params={"start": date, "end": date},
        headers={"Authorization": f"Basic {auth}"},
        timeout=timeout,
    )
    response.raise_for_status()

    data = (response.json().get("data") or [{}])[0]
    total_seconds = (data.get("grand_total") or {}).get("total_seconds", 0)
    total_h = _hours(total_seconds)

    return {
        "total_h": total_h,
        "by_language": _hours_by_name(data.get("languages")),
        "by_project": _hours_by_name(data.get("projects")),
        "focus_h": total_h,
    }
