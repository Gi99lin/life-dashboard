"""
run_collect.py — Periodic data collection for Life Dashboard.

Runs on cron every 2 hours inside the collector container.
Fetches: Garmin (today + yesterday), Weather (today), Git (today).
Merges into /data/metrics.json.
"""

import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

    save_metrics(metrics)
    print(f"\n✅ Saved to {METRICS_PATH}")


if __name__ == '__main__':
    main()
