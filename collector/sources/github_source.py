"""GitHub search based development activity."""

import requests


SEARCH_URL = "https://api.github.com/search/issues"


def _empty():
    return {
        "prs_merged": 0,
        "reviews": 0,
        "streak": 0,
        "langs": {},
        "additions": None,
        "deletions": None,
    }


def _headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }


def _search_count(query, token, timeout):
    response = requests.get(
        SEARCH_URL,
        params={"q": query},
        headers=_headers(token),
        timeout=timeout,
    )
    if response.status_code == 403:
        return None
    response.raise_for_status()
    return int(response.json().get("total_count") or 0)


def fetch_day(date, token, user, timeout=15):
    """Fetch GitHub PR/review activity for one day.

    Language and diff stats are intentionally absent in this v1 because the
    search API result does not contain them; run_collect derives streak later.
    """
    result = _empty()
    merged = _search_count(f"type:pr author:{user} merged:{date}", token, timeout)
    if merged is None:
        return result

    reviews = _search_count(f"type:pr reviewed-by:{user} updated:{date}", token, timeout)
    if reviews is None:
        return result

    result["prs_merged"] = merged
    result["reviews"] = reviews
    return result
