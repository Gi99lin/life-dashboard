import json

import responses

from collector.ai_insights import generate_brief


@responses.activate
def test_generate_brief_uses_llm():
    responses.add(
        responses.POST,
        "http://llm.local/v1/chat/completions",
        json={"choices": [{"message": {"content": "Хороший день."}}]},
        status=200,
    )
    days = [
        {
            "garmin": {"sleep_hours": 7.4, "sleep_score": 82},
            "wakatime": {"total_h": 4.8},
            "manual": {"mood": 4},
        }
    ]

    out = generate_brief(
        days,
        {"strongest": [{"a": "Сон", "b": "Наст", "r": 0.62}]},
        base_url="http://llm.local/v1",
        api_key="k",
        model="m",
    )

    assert out["text"] == "Хороший день."
    assert "Garmin" in out["sources"]
    assert "WakaTime" in out["sources"]
    assert "Obsidian" in out["sources"]
    assert out["generated_at"].endswith("Z")

    request = responses.calls[0].request
    assert request.headers["Authorization"] == "Bearer k"
    assert request.headers["Content-Type"] == "application/json"
    payload = json.loads(request.body.decode("utf-8"))
    assert payload["model"] == "m"
    assert "сон 7.4ч" in payload["messages"][1]["content"]
    assert "Сон↔Наст r=0.62" in payload["messages"][1]["content"]
