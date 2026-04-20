"""
Git source — counts commits per day across tracked repositories.
"""

import os
import re
import subprocess
from datetime import datetime
from typing import Dict, List, Optional


def count_commits_for_date(repo_path: str, date_str: str, author_email: Optional[str] = None) -> int:
    """Count commits on a specific date in a git repo."""
    cmd = ['git', '-C', repo_path, 'log', '--oneline',
           f'--after={date_str} 00:00', f'--before={date_str} 23:59']

    if author_email:
        cmd.extend([f'--author={author_email}'])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return 0
        lines = [l for l in result.stdout.strip().split('\n') if l.strip()]
        return len(lines)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return 0


def collect_git_for_date(repos: List[str], date_str: str,
                         author_email: Optional[str] = None) -> dict:
    """
    Collect git activity across multiple repos for a specific date.

    Args:
        repos: List of absolute paths to git repositories
        date_str: Date string like '2026-03-19'
        author_email: Optional filter by author email

    Returns:
        {'commits': 12, 'repos': ['omniroute', 'life-dashboard']}
    """
    total = 0
    active_repos = []

    for repo_path in repos:
        if not os.path.isdir(os.path.join(repo_path, '.git')):
            continue

        count = count_commits_for_date(repo_path, date_str, author_email)
        if count > 0:
            total += count
            repo_name = os.path.basename(repo_path)
            active_repos.append(repo_name)

    return {
        'commits': total,
        'repos': active_repos,
    }


def collect_git_range(repos: List[str], start_date: str, end_date: str,
                      author_email: Optional[str] = None) -> Dict[str, dict]:
    """Collect git data for a date range."""
    from datetime import timedelta

    results = {}
    current = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')

    while current <= end:
        date_str = current.strftime('%Y-%m-%d')
        results[date_str] = collect_git_for_date(repos, date_str, author_email)
        current += timedelta(days=1)

    return results


if __name__ == '__main__':
    import json
    import sys

    # Default: scan My_server subdirectories
    base = '/Users/ivanakimkin/Projects/My_server'
    repos = [os.path.join(base, d) for d in os.listdir(base)
             if os.path.isdir(os.path.join(base, d, '.git'))]

    date = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime('%Y-%m-%d')
    result = collect_git_for_date(repos, date)
    print(f"Repos scanned: {len(repos)}")
    print(json.dumps(result, indent=2, ensure_ascii=False))
