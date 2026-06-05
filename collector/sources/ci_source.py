"""GitHub Actions CI status source."""

import requests


def _empty(repo):
    return {
        "repo": repo,
        "status": None,
        "conclusion": None,
        "updated_at": None,
    }


def _headers(token=None):
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_status(repo, token=None, timeout=15):
    """Return the latest GitHub Actions run status for ``owner/repo``."""
    if not repo or "/" not in repo:
        return _empty(repo)

    response = requests.get(
        f"https://api.github.com/repos/{repo}/actions/runs",
        params={"per_page": "1"},
        headers=_headers(token),
        timeout=timeout,
    )
    if response.status_code in (403, 404):
        return _empty(repo)
    response.raise_for_status()

    runs = response.json().get("workflow_runs") or []
    if not runs:
        return _empty(repo)

    latest = runs[0]
    return {
        "repo": repo,
        "status": latest.get("status"),
        "conclusion": latest.get("conclusion"),
        "updated_at": latest.get("updated_at"),
    }


def fetch_all(repos, token=None, timeout=15):
    """Fetch latest CI statuses, tolerating unavailable repositories."""
    statuses = []
    for repo in repos or []:
        try:
            statuses.append(fetch_status(repo, token=token, timeout=timeout))
        except requests.RequestException:
            statuses.append(_empty(repo))
    return statuses
