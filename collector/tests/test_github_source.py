import responses
from responses import matchers

from collector.sources.github_source import fetch_day


SEARCH_URL = "https://api.github.com/search/issues"


@responses.activate
def test_fetch_day_parses_prs_and_reviews():
    responses.add(
        responses.GET,
        SEARCH_URL,
        json={"total_count": 3, "items": []},
        match=[
            matchers.query_param_matcher(
                {"q": "type:pr author:ivan merged:2026-06-04"}
            )
        ],
        status=200,
    )
    responses.add(
        responses.GET,
        SEARCH_URL,
        json={"total_count": 5, "items": []},
        match=[
            matchers.query_param_matcher(
                {"q": "type:pr reviewed-by:ivan updated:2026-06-04"}
            )
        ],
        status=200,
    )

    out = fetch_day("2026-06-04", token="tok", user="ivan")

    assert out == {
        "prs_merged": 3,
        "reviews": 5,
        "streak": 0,
        "langs": {},
        "additions": None,
        "deletions": None,
    }
    for call in responses.calls:
        assert call.request.headers["Authorization"] == "Bearer tok"
        assert call.request.headers["Accept"] == "application/vnd.github+json"


@responses.activate
def test_fetch_day_returns_zeros_on_rate_limit():
    responses.add(
        responses.GET,
        SEARCH_URL,
        json={"message": "API rate limit exceeded"},
        status=403,
    )

    out = fetch_day("2026-06-04", token="tok", user="ivan")

    assert out["prs_merged"] == 0
    assert out["reviews"] == 0
