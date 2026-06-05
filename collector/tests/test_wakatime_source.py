import base64

import responses

from collector.sources.wakatime_source import fetch_day


@responses.activate
def test_fetch_day_parses_languages_and_focus():
    responses.add(
        responses.GET,
        "https://wakatime.com/api/v1/users/current/summaries",
        json={
            "data": [
                {
                    "grand_total": {"total_seconds": 17280},
                    "languages": [
                        {"name": "TypeScript", "total_seconds": 6840},
                        {"name": "Python", "total_seconds": 4680},
                    ],
                    "projects": [
                        {"name": "omniroute", "total_seconds": 9000},
                    ],
                }
            ]
        },
        status=200,
    )

    out = fetch_day("2026-06-04", api_key="k")

    assert out["total_h"] == 4.8
    assert out["by_language"]["TypeScript"] == 1.9
    assert out["by_project"]["omniroute"] == 2.5
    assert "focus_h" in out

    request = responses.calls[0].request
    assert request.url == (
        "https://wakatime.com/api/v1/users/current/summaries"
        "?start=2026-06-04&end=2026-06-04"
    )
    expected_auth = base64.b64encode(b"k:").decode("ascii")
    assert request.headers["Authorization"] == f"Basic {expected_auth}"
