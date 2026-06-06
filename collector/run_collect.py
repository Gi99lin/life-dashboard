"""
run_collect.py — Periodic data collection for Life Dashboard.

Runs on cron every 2 hours inside the collector container.
Fetches: Garmin (today + yesterday), Weather (today), Git (today).
Merges into /data/metrics.json.
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from findings import build_findings
from metrics_calc import build_correlations, compute_readiness

METRICS_PATH = os.environ.get('METRICS_PATH', '/data/metrics.json')
VAULT_PATH = os.environ.get('VAULT_PATH', '/vault')


WEEKDAYS_RU = {
    0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'
}


def load_metrics():
    try:
        with open(METRICS_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'days': {}, 'meta': {}}


def save_metrics(metrics):
    metrics['meta']['last_updated'] = datetime.now().isoformat()
    os.makedirs(os.path.dirname(METRICS_PATH), exist_ok=True)
    with open(METRICS_PATH, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)


def ensure_day(metrics, date_str):
    """Ensure a day entry exists in metrics."""
    if date_str not in metrics['days']:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        metrics['days'][date_str] = {
            'date': date_str,
            'weekday': WEEKDAYS_RU[dt.weekday()],
            'week_iso': dt.strftime('%Y-W%V'),
        }
    return metrics['days'][date_str]


def collect_garmin(metrics, dates):
    """Fetch Garmin data for given dates."""
    try:
        from sources.garmin_source import init_garmin, fetch_garmin_day

        client = init_garmin()
        print(f"  Garmin: logged in")

        for date_str in dates:
            data = fetch_garmin_day(client, date_str)
            if data:
                day = ensure_day(metrics, date_str)
                day['garmin'] = data
                steps = data.get('steps', '?')
                bb = data.get('body_battery_max', '?')
                print(f"  Garmin {date_str}: steps={steps}, bb={bb}")
            else:
                print(f"  Garmin {date_str}: no data")
    except ImportError:
        print("  Garmin: garminconnect not installed, skipping")
    except Exception as e:
        print(f"  Garmin error: {e}")


def collect_weather(metrics, dates):
    """Fetch weather for given dates."""
    try:
        from sources.weather_source import fetch_weather_range

        lat = float(os.environ.get('WEATHER_LAT', '55.7558'))
        lon = float(os.environ.get('WEATHER_LON', '37.6173'))

        start = min(dates)
        end = max(dates)
        weather = fetch_weather_range(start, end, lat, lon)

        for date_str, wdata in weather.items():
            day = ensure_day(metrics, date_str)
            day['weather'] = wdata

        print(f"  Weather: {len(weather)} days")
    except Exception as e:
        print(f"  Weather error: {e}")


def collect_git(metrics, dates):
    """Collect git commits for given dates."""
    try:
        from sources.git_source import collect_git_range

        git_base = os.environ.get('GIT_REPOS_PATH', '/repos')
        repos = []
        if os.path.isdir(git_base):
            # Check if base dir itself is a git repo (monorepo)
            if os.path.isdir(os.path.join(git_base, '.git')):
                repos.append(git_base)
            # Also scan subdirectories for individual repos
            for d in os.listdir(git_base):
                repo_path = os.path.join(git_base, d)
                if os.path.isdir(os.path.join(repo_path, '.git')):
                    repos.append(repo_path)

        if repos:
            start = min(dates)
            end = max(dates)
            git_data = collect_git_range(repos, start, end)

            for date_str, gdata in git_data.items():
                day = ensure_day(metrics, date_str)
                day['git'] = gdata

            total = sum(d['commits'] for d in git_data.values())
            print(f"  Git: {total} commits from {len(repos)} repos")
        else:
            print(f"  Git: no repos found in {git_base}")
    except Exception as e:
        print(f"  Git error: {e}")


def collect_schedules(metrics, dates):
    """Fetch schedules for given dates."""
    try:
        from sources.schedule_source import parse_schedule_file
        import glob

        vault_path = os.environ.get('VAULT_PATH', '/vault')
        
        for date_str in dates:
            patterns = [
                os.path.join(vault_path, 'Жизнь', 'Daily', '**', f'{date_str}-schedules.md'),
                os.path.join(vault_path, 'Жизнь', 'Daily', f'{date_str}-schedules.md'),
            ]
            
            filepath = None
            for pattern in patterns:
                files = glob.glob(pattern, recursive=True)
                if files:
                    filepath = files[0]
                    break
                    
            if filepath:
                s_data = parse_schedule_file(filepath)
                if s_data:
                    day = ensure_day(metrics, date_str)
                    day['schedule'] = {
                        'wake_time': s_data.get('wake_time'),
                        'hours_work': s_data.get('hours_work', 0),
                        'hours_projects': s_data.get('hours_projects', 0),
                        'hours_games': s_data.get('hours_games', 0),
                        'hours_rest': s_data.get('hours_rest', 0),
                        'hours_food': s_data.get('hours_food', 0),
                        'hours_commute': s_data.get('hours_commute', 0),
                        'hours_productive': s_data.get('hours_productive', 0),
                        'hours_sleep': s_data.get('hours_sleep', 0),
                    }
                    print(f"  Schedule {date_str}: parsed successfully")
            else:
                print(f"  Schedule {date_str}: no schedule file found")
    except Exception as e:
        print(f"  Schedule error: {e}")


def _env_list(name):
    return [item.strip() for item in os.environ.get(name, '').split(',') if item.strip()]


def collect_wakatime(metrics, dates):
    """Fetch optional WakaTime coding summaries for given dates."""
    api_key = os.environ.get('WAKATIME_API_KEY')
    if not api_key:
        print("  WakaTime: no API key, skipping")
        return

    try:
        from sources.wakatime_source import fetch_day

        for date_str in dates:
            try:
                data = fetch_day(date_str, api_key)
                day = ensure_day(metrics, date_str)
                day['wakatime'] = data
                print(f"  WakaTime {date_str}: {data.get('total_h', 0)}h")
            except Exception as e:
                print(f"  WakaTime {date_str} error: {e}")
    except Exception as e:
        print(f"  WakaTime error: {e}")


def collect_github_deep(metrics, dates):
    """Fetch optional GitHub PR/review activity for given dates."""
    token = os.environ.get('GITHUB_TOKEN')
    user = os.environ.get('GITHUB_USER')
    if not token or not user:
        print("  GitHub: no token/user, skipping")
        return

    try:
        from sources.github_source import fetch_day

        for date_str in dates:
            try:
                data = fetch_day(date_str, token, user)
                day = ensure_day(metrics, date_str)
                day['github'] = data
                print(
                    f"  GitHub {date_str}: "
                    f"prs={data.get('prs_merged', 0)}, reviews={data.get('reviews', 0)}"
                )
            except Exception as e:
                print(f"  GitHub {date_str} error: {e}")
    except Exception as e:
        print(f"  GitHub error: {e}")


def attach_github_streaks(metrics):
    """Attach consecutive code-day streaks to days with GitHub data."""
    streak = 0
    for date_str in sorted(metrics.get('days', {})):
        day = metrics['days'][date_str]
        commits = (day.get('git') or {}).get('commits') or 0
        streak = streak + 1 if commits > 0 else 0
        if day.get('github') is not None:
            day['github']['streak'] = streak


def attach_now_meta(metrics, today):
    """Expose today's WakaTime top project for the dashboard live strip."""
    day = metrics.get('days', {}).get(today) or {}
    wakatime = day.get('wakatime') or {}
    if not wakatime:
        return

    projects = wakatime.get('by_project') or {}
    languages = wakatime.get('by_language') or {}
    project = next(iter(projects), None) or next(iter(languages), None)
    focus_h = wakatime.get('focus_h')
    if focus_h is None:
        focus_h = wakatime.get('total_h') or 0

    metrics.setdefault('meta', {})['now'] = {
        'activity': 'Код',
        'project': project,
        'focus_min': round(focus_h * 60),
        'source': 'WakaTime',
    }


def collect_ci_meta(metrics):
    """Fetch optional CI statuses into meta.ci."""
    repos = _env_list('CI_REPOS') or _env_list('GITHUB_CI_REPOS')
    if not repos:
        print("  CI: no repos configured, skipping")
        return

    try:
        from sources.ci_source import fetch_all

        token = os.environ.get('GITHUB_TOKEN')
        metrics.setdefault('meta', {})['ci'] = fetch_all(repos, token)
        print(f"  CI: {len(repos)} repos")
    except Exception as e:
        print(f"  CI error: {e}")


def _brief_sources(day):
    labels = {
        'garmin': 'Garmin',
        'github': 'GitHub',
        'wakatime': 'WakaTime',
        'manual': 'Obsidian',
    }
    return [label for key, label in labels.items() if day.get(key)]


def _fallback_ai_brief(day):
    return {
        'text': 'AI-разбор временно недоступен. Показываю только собранные числовые метрики.',
        'sources': _brief_sources(day),
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    }


def attach_ai_brief(metrics):
    """Attach an LLM-generated daily brief when optional LLM env is configured."""
    base_url = os.environ.get('LLM_BASE_URL')
    api_key = os.environ.get('LLM_API_KEY')
    model = os.environ.get('LLM_MODEL')
    if not base_url or not api_key or not model:
        print("  AI brief: no LLM config, skipping")
        return

    days = metrics.setdefault('days', {})
    meta = metrics.setdefault('meta', {})
    ordered = [days[k] for k in sorted(days)]
    today = ordered[-1] if ordered else {}

    try:
        from ai_insights import generate_brief

        meta['ai_brief'] = generate_brief(
            ordered,
            meta.get('correlations') or {},
            base_url,
            api_key,
            model,
        )
        print("  AI brief: generated")
    except Exception as e:
        meta['ai_brief'] = _fallback_ai_brief(today)
        print(f"  AI brief error: {e}")


def attach_derived_metrics(metrics):
    """Attach cached readiness scores and trailing correlations."""
    days = metrics.setdefault('days', {})
    meta = metrics.setdefault('meta', {})

    hrv_vals = [d.get('garmin', {}).get('hrv') for d in days.values()]
    hrv_vals = sorted(v for v in hrv_vals if v is not None)
    hrv_baseline = hrv_vals[len(hrv_vals) // 2] if hrv_vals else None

    for day in days.values():
        day['readiness'] = compute_readiness(day, hrv_baseline)

    ordered = [days[k] for k in sorted(days)]
    meta['correlations'] = build_correlations(ordered[-30:])


def attach_findings(metrics):
    """Attach cached statistical findings for the Analytics lab."""
    days = metrics.setdefault('days', {})
    ordered = [days[k] for k in sorted(days)]
    try:
        metrics.setdefault('meta', {})['findings'] = build_findings(ordered[-30:])
    except Exception as e:
        metrics.setdefault('meta', {})['findings'] = []
        print(f"  Findings error: {e}")


def main():
    now = datetime.now()
    today = now.strftime('%Y-%m-%d')
    yesterday = (now - timedelta(days=1)).strftime('%Y-%m-%d')
    dates = [yesterday, today]

    print(f"\n{'='*50}")
    print(f"Life Dashboard Collector — {now.strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*50}")

    metrics = load_metrics()

    collect_garmin(metrics, dates)
    collect_weather(metrics, dates)
    collect_git(metrics, dates)
    collect_schedules(metrics, dates)
    collect_wakatime(metrics, dates)
    collect_github_deep(metrics, dates)
    attach_github_streaks(metrics)

    attach_derived_metrics(metrics)
    attach_findings(metrics)
    attach_ai_brief(metrics)
    attach_now_meta(metrics, today)
    collect_ci_meta(metrics)
    save_metrics(metrics)
    print(f"\n✅ Saved to {METRICS_PATH}")


if __name__ == '__main__':
    main()
