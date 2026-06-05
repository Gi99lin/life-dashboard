import responses
from responses import matchers

from collector.sources.ci_source import fetch_all, fetch_status


@responses.activate
def test_fetch_status_returns_latest_actions_run():
    responses.add(
        responses.GET,
        "https://api.github.com/repos/owner/repo/actions/runs",
        json={
            "workflow_runs": [
                {
                    "status": "completed",
                    "conclusion": "success",
                    "updated_at": "2026-06-04T10:15:00Z",
                }
            ]
        },
        match=[matchers.query_param_matcher({"per_page": "1"})],
        status=200,
    )

    out = fetch_status("owner/repo", token="tok")

    assert out == {
        "repo": "owner/repo",
        "status": "completed",
        "conclusion": "success",
        "updated_at": "2026-06-04T10:15:00Z",
    }
    assert responses.calls[0].request.headers["Authorization"] == "Bearer tok"
    assert responses.calls[0].request.headers["Accept"] == "application/vnd.github+json"


@responses.activate
def test_fetch_all_tolerates_missing_repos():
    responses.add(
        responses.GET,
        "https://api.github.com/repos/missing/repo/actions/runs",
        json={"message": "Not Found"},
        status=404,
    )

    out = fetch_all(["missing/repo"], token="tok")

    assert out == [
        {
            "repo": "missing/repo",
            "status": None,
            "conclusion": None,
            "updated_at": None,
        }
    ]
