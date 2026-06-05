"""Daily AI brief via an OpenAI-compatible self-hosted LLM."""

import datetime

import requests


SYS = (
    "Ты — лаконичный ассистент личного дашборда. По числам дня и корреляциям "
    "напиши 1–2 предложения по-русски: что хорошо/плохо и почему. Без воды, "
    "без выдуманных данных. Опирайся только на переданные числа."
)


def _sources(day):
    labels = {
        "garmin": "Garmin",
        "github": "GitHub",
        "wakatime": "WakaTime",
        "manual": "Obsidian",
    }
    return [label for key, label in labels.items() if day.get(key)]


def _prompt(day, correlations):
    garmin = day.get("garmin") or {}
    wakatime = day.get("wakatime") or {}
    manual = day.get("manual") or {}
    git = day.get("git") or {}
    github = day.get("github") or {}

    facts = [
        f"сон {garmin.get('sleep_hours')}ч",
        f"оценка сна {garmin.get('sleep_score')}",
        f"body battery {garmin.get('body_battery_max')}",
        f"стресс {garmin.get('stress_avg')}",
        f"настроение {manual.get('mood')}/5",
        f"код {wakatime.get('total_h')}ч",
        f"коммиты {git.get('commits')}",
        f"PR {github.get('prs_merged')}",
        f"review {github.get('reviews')}",
    ]
    top = "; ".join(
        f"{item['a']}↔{item['b']} r={item['r']}"
        for item in (correlations or {}).get("strongest", [])[:3]
    )
    return "Числа дня: " + ", ".join(facts) + ". Корреляции: " + top + "."


def generate_brief(days, correlations, base_url, api_key, model, timeout=30):
    """Generate a cached daily brief from latest day facts and correlations."""
    today = days[-1] if days else {}
    payload = {
        "model": model,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": SYS},
            {"role": "user", "content": _prompt(today, correlations)},
        ],
    }
    response = requests.post(
        f"{base_url.rstrip('/')}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=timeout,
    )
    response.raise_for_status()
    text = response.json()["choices"][0]["message"]["content"].strip()
    return {
        "text": text,
        "sources": _sources(today),
        "generated_at": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
    }
