"""
backfill_2months.py — Backfill the last 2 months of data into metrics.json.

Collects: Garmin, Weather, Git, Schedules, Daily Notes
Merges into existing metrics.json (does not overwrite existing data).

Usage (inside collector container):
  python3 /app/backfill_2months.py

Or via docker:
  docker exec life-dashboard-collector python3 /app/backfill_2months.py
"""

import json
import os
import re
import sys
import glob
import time
from datetime import datetime, timedelta
from typing import Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sources.schedule_source import collect_all_schedules, parse_schedule_file
from sources.weather_source import fetch_weather_range
from sources.git_source import collect_git_range

METRICS_PATH = os.environ.get('METRICS_PATH', '/data/metrics.json')
VAULT_PATH = os.environ.get('VAULT_PATH', '/vault')

WEEKDAYS_RU = {
    0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'
}

DAYS_BACK = int(os.environ.get('BACKFILL_DAYS', '60'))


def load_metrics():
    try:
        with open(METRICS_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'days': {}, 'meta': {}}


def save_metrics(metrics):
    metrics['meta']['last_updated'] = datetime.now().isoformat()
    metrics['meta']['last_backfill'] = datetime.now().isoformat()
    os.makedirs(os.path.dirname(METRICS_PATH), exist_ok=True)
    with open(METRICS_PATH, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)


def date_range(start_str, end_str):
    """Generate list of YYYY-MM-DD strings from start to end inclusive."""
    start = datetime.strptime(start_str, '%Y-%m-%d')
    end = datetime.strptime(end_str, '%Y-%m-%d')
    dates = []
    current = start
    while current <= end:
        dates.append(current.strftime('%Y-%m-%d'))
        current += timedelta(days=1)
    return dates


def ensure_day(metrics, date_str):
    if date_str not in metrics['days']:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        metrics['days'][date_str] = {
            'date': date_str,
            'weekday': WEEKDAYS_RU[dt.weekday()],
            'week_iso': dt.strftime('%Y-W%V'),
        }
    return metrics['days'][date_str]


def parse_daily_frontmatter(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except IOError:
        return None

    match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return None

    frontmatter = match.group(1)
    result = {}

    for line in frontmatter.strip().split('\n'):
        line = line.strip()
        if ':' not in line:
            continue
        key, value = line.split(':', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key == 'mood':
            try:
                result['mood'] = int(value)
            except ValueError:
                pass
        elif key == 'Питание_до_20':
            result['food_before_20'] = value.lower() == 'true'
        elif key == 'Сон_8ч_и_до_9':
            result['sleep_goal'] = value.lower() == 'true'
        elif key == 'Работа_над_проектом':
            result['project_work'] = value.lower() == 'true'

    # Extract note body
    body_match = re.search(r'^---\s*\n.*?\n---\s*\n(.+)', content, re.DOTALL)
    if body_match:
        body = body_match.group(1).strip()
        first_para = body.split('\n\n')[0].strip()
        if first_para and len(first_para) < 500:
            result['note'] = first_para

    return result if result else None


def collect_daily_notes(vault_path, dates):
    """Parse daily notes for specific dates."""
    results = {}
    for date_str in dates:
        patterns = [
            os.path.join(vault_path, 'Жизнь', 'Daily', '**', f'{date_str}.md'),
            os.path.join(vault_path, 'Жизнь', 'Daily', f'{date_str}.md'),
        ]
        for pattern in patterns:
            files = glob.glob(pattern, recursive=True)
            if files:
                parsed = parse_daily_frontmatter(files[0])
                if parsed:
                    results[date_str] = parsed
                break
    return results


def collect_schedules_range(vault_path, dates):
    """Parse schedule files for specific dates."""
    results = {}
    for date_str in dates:
        patterns = [
            os.path.join(vault_path, 'Жизнь', 'Daily', '**', f'{date_str}-schedules.md'),
            os.path.join(vault_path, 'Жизнь', 'Daily', f'{date_str}-schedules.md'),
        ]
        for pattern in patterns:
            files = glob.glob(pattern, recursive=True)
            if files:
                s_data = parse_schedule_file(files[0])
                if s_data:
                    results[date_str] = s_data
                break
    return results


def collect_garmin_range(dates):
    """Backfill Garmin data for a range of dates."""
    results = {}
    try:
        from sources.garmin_source import init_garmin, fetch_garmin_day

        client = init_garmin()
        print(f"  Garmin: logged in, backfilling {len(dates)} days...")
        
        for i, date_str in enumerate(dates):
            try:
                data = fetch_garmin_day(client, date_str)
                if data:
                    results[date_str] = data
                    steps = data.get('steps', '?')
                    bb = data.get('body_battery_max', '?')
                    print(f"  [{i+1}/{len(dates)}] {date_str}: steps={steps}, bb={bb}")
                else:
                    print(f"  [{i+1}/{len(dates)}] {date_str}: no data")
            except Exception as e:
                print(f"  [{i+1}/{len(dates)}] {date_str}: error — {e}")
            
            # Rate-limit Garmin API (avoid throttling)
            if (i + 1) % 5 == 0:
                time.sleep(2)
            else:
                time.sleep(0.5)

    except ImportError:
        print("  Garmin: garminconnect not installed, skipping")
    except Exception as e:
        print(f"  Garmin login error: {e}")
    
    return results


def main():
    now = datetime.now()
    end_str = now.strftime('%Y-%m-%d')
    start_str = (now - timedelta(days=DAYS_BACK)).strftime('%Y-%m-%d')
    dates = date_range(start_str, end_str)

    print(f"\n{'='*60}")
    print(f"Life Dashboard — 2-Month Backfill")
    print(f"{'='*60}")
    print(f"Range: {start_str} → {end_str} ({len(dates)} days)")
    print(f"Vault: {VAULT_PATH}")
    print(f"Output: {METRICS_PATH}")

    metrics = load_metrics()
    existing_count = len(metrics.get('days', {}))
    print(f"Existing data: {existing_count} days\n")

    # 1. Schedules
    print("📋 Parsing schedules...")
    schedules = collect_schedules_range(VAULT_PATH, dates)
    print(f"   Found: {len(schedules)} schedule entries\n")

    # 2. Daily notes
    print("📝 Parsing daily notes...")
    daily_notes = collect_daily_notes(VAULT_PATH, dates)
    print(f"   Found: {len(daily_notes)} daily notes\n")

    # 3. Weather
    print("🌤  Fetching historical weather...")
    try:
        lat = float(os.environ.get('WEATHER_LAT', '55.7558'))
        lon = float(os.environ.get('WEATHER_LON', '37.6173'))
        weather = fetch_weather_range(start_str, end_str, lat, lon)
        print(f"   Got: {len(weather)} days\n")
    except Exception as e:
        print(f"   Error: {e}\n")
        weather = {}

    # 4. Git
    print("💻 Collecting git commits...")
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
    
    print(f"   Repos found: {[os.path.basename(r) for r in repos]}")

    git_data = {}
    if repos:
        try:
            git_data = collect_git_range(repos, start_str, end_str)
            total_commits = sum(d.get('commits', 0) for d in git_data.values())
            print(f"   Found: {total_commits} commits from {len(repos)} repos\n")
        except Exception as e:
            print(f"   Error: {e}\n")
    else:
        print(f"   No repos found in {git_base}\n")

    # 5. Garmin
    # Only backfill days that don't have garmin data yet
    dates_without_garmin = [
        d for d in dates 
        if not metrics.get('days', {}).get(d, {}).get('garmin')
    ]
    print(f"⌚ Garmin backfill ({len(dates_without_garmin)} days without data)...")
    garmin_data = collect_garmin_range(dates_without_garmin)
    print(f"   Got: {len(garmin_data)} days\n")

    # 6. Merge everything
    print("🔧 Merging data...")
    updated = 0
    for date_str in dates:
        day = ensure_day(metrics, date_str)

        if date_str in schedules:
            s = schedules[date_str]
            day['schedule'] = {
                'wake_time': s.get('wake_time'),
                'hours_work': s.get('hours_work', 0),
                'hours_projects': s.get('hours_projects', 0),
                'hours_games': s.get('hours_games', 0),
                'hours_rest': s.get('hours_rest', 0),
                'hours_food': s.get('hours_food', 0),
                'hours_commute': s.get('hours_commute', 0),
                'hours_productive': s.get('hours_productive', 0),
                'hours_sleep': s.get('hours_sleep', 0),
            }

        if date_str in weather:
            day['weather'] = weather[date_str]

        if date_str in git_data:
            day['git'] = git_data[date_str]

        if date_str in garmin_data:
            day['garmin'] = garmin_data[date_str]

        if date_str in daily_notes:
            dn = daily_notes[date_str]
            day['manual'] = {
                'mood': dn.get('mood'),
                'food_before_20': dn.get('food_before_20'),
                'note': dn.get('note'),
            }

        updated += 1

    save_metrics(metrics)

    # Summary
    final_count = len(metrics['days'])
    days_with_garmin = sum(1 for d in metrics['days'].values() if d.get('garmin'))
    days_with_mood = sum(1 for d in metrics['days'].values() if d.get('manual', {}).get('mood'))
    days_with_schedule = sum(1 for d in metrics['days'].values() if 'schedule' in d)
    days_with_weather = sum(1 for d in metrics['days'].values() if 'weather' in d)
    days_with_git = sum(1 for d in metrics['days'].values() if d.get('git', {}).get('commits', 0) > 0)

    print(f"\n{'='*60}")
    print(f"✅ Backfill complete!")
    print(f"{'='*60}")
    print(f"Total days in metrics: {final_count} (was {existing_count})")
    print(f"\n📊 Coverage ({start_str} → {end_str}):")
    print(f"   Garmin:   {days_with_garmin}/{len(dates)}")
    print(f"   Mood:     {days_with_mood}/{len(dates)}")
    print(f"   Schedule: {days_with_schedule}/{len(dates)}")
    print(f"   Weather:  {days_with_weather}/{len(dates)}")
    print(f"   Git:      {days_with_git}/{len(dates)}")


if __name__ == '__main__':
    main()
