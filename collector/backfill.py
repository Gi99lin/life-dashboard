"""
Backfill — одноразовый импорт исторических данных в metrics.json.

Собирает:
1. Schedules файлы → часы по активностям
2. Daily notes frontmatter → mood, чекбоксы
3. Weather API → историческая погода
4. Git → коммиты за каждый день

Результат: data/metrics.json
"""

import json
import os
import re
import sys
import glob
from datetime import datetime, timedelta
from typing import Dict, Optional

# Add parent dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sources.schedule_source import collect_all_schedules
from sources.weather_source import fetch_weather_range
from sources.git_source import collect_git_range


WEEKDAYS_RU = {
    0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'
}


def parse_daily_frontmatter(filepath: str) -> Optional[dict]:
    """
    Parse YAML frontmatter from a daily note.

    Expected format:
        ---
        mood: "4"
        Сон_8ч_и_до_9: false
        Питание_до_20: true
        Работа_над_проектом: true
        ---
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except IOError:
        return None

    # Extract frontmatter between --- delimiters
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

    # Extract note text (everything after frontmatter, first paragraph)
    body_match = re.search(r'^---\s*\n.*?\n---\s*\n(.+)', content, re.DOTALL)
    if body_match:
        body = body_match.group(1).strip()
        # Take first paragraph as the note
        first_para = body.split('\n\n')[0].strip()
        if first_para and len(first_para) < 500:
            result['note'] = first_para

    return result if result else None


def collect_all_daily_notes(vault_path: str) -> Dict[str, dict]:
    """Find and parse all daily notes with frontmatter."""
    results = {}

    patterns = [
        os.path.join(vault_path, 'Жизнь', 'Daily', '**', '*.md'),
        os.path.join(vault_path, 'Жизнь', 'Daily', '*.md'),
    ]

    files = set()
    for pattern in patterns:
        files.update(glob.glob(pattern, recursive=True))

    for filepath in sorted(files):
        basename = os.path.basename(filepath)
        # Skip schedules files
        if 'schedules' in basename:
            continue

        date_match = re.match(r'(\d{4}-\d{2}-\d{2})', basename)
        if not date_match:
            continue

        date_str = date_match.group(1)
        parsed = parse_daily_frontmatter(filepath)
        if parsed:
            results[date_str] = parsed

    return results


def backfill(vault_path: str, output_path: str, git_repos: list = None,
             weather_lat: float = 55.7558, weather_lon: float = 37.6173):
    """
    Run full backfill: collect all historical data and write metrics.json.
    """
    print("=" * 60)
    print("Life Dashboard — Backfill")
    print("=" * 60)

    # 1. Parse schedules
    print("\n📋 Parsing schedule files...")
    schedules = collect_all_schedules(vault_path)
    print(f"   Found {len(schedules)} schedule entries")

    # 2. Parse daily notes
    print("\n📝 Parsing daily note frontmatter...")
    daily_notes = collect_all_daily_notes(vault_path)
    print(f"   Found {len(daily_notes)} daily notes with frontmatter")

    # Determine date range
    all_dates = sorted(set(list(schedules.keys()) + list(daily_notes.keys())))
    if not all_dates:
        print("❌ No data found!")
        return

    start_date = all_dates[0]
    end_date = all_dates[-1]
    print(f"\n📅 Date range: {start_date} → {end_date}")

    # 3. Fetch weather
    print("\n🌤 Fetching historical weather...")
    weather = fetch_weather_range(start_date, end_date, weather_lat, weather_lon)
    print(f"   Got weather for {len(weather)} days")

    # 4. Collect git data
    git_data = {}
    if git_repos:
        print(f"\n💻 Collecting git activity from {len(git_repos)} repos...")
        git_data = collect_git_range(git_repos, start_date, end_date)
        total_commits = sum(d['commits'] for d in git_data.values())
        print(f"   Found {total_commits} commits total")
    else:
        print("\n💻 Git repos not configured, skipping")

    # 5. Merge everything into metrics.json
    print("\n🔧 Merging data...")
    days = {}

    for date_str in all_dates:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        iso_week = dt.strftime('%Y-W%V')
        weekday = WEEKDAYS_RU[dt.weekday()]

        day = {
            'date': date_str,
            'weekday': weekday,
            'week_iso': iso_week,
        }

        # Schedule data
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

        # Weather data
        if date_str in weather:
            day['weather'] = weather[date_str]

        # Git data
        if date_str in git_data:
            day['git'] = git_data[date_str]

        # Manual data (from daily notes frontmatter)
        if date_str in daily_notes:
            dn = daily_notes[date_str]
            day['manual'] = {
                'mood': dn.get('mood'),
                'food_before_20': dn.get('food_before_20'),
                'note': dn.get('note'),
            }

        # Garmin placeholder (will be filled by garmin_source later)
        # day['garmin'] = {}

        days[date_str] = day

    metrics = {
        'days': days,
        'meta': {
            'last_updated': datetime.now().isoformat(),
            'version': 1,
            'backfill_range': f'{start_date} → {end_date}',
        }
    }

    # Write output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Wrote {len(days)} days to {output_path}")
    print(f"   Date range: {start_date} → {end_date}")

    # Stats summary
    days_with_mood = sum(1 for d in days.values() if d.get('manual', {}).get('mood'))
    days_with_schedule = sum(1 for d in days.values() if 'schedule' in d)
    days_with_weather = sum(1 for d in days.values() if 'weather' in d)
    days_with_git = sum(1 for d in days.values() if d.get('git', {}).get('commits', 0) > 0)

    print(f"\n📊 Coverage:")
    print(f"   Mood:     {days_with_mood}/{len(days)}")
    print(f"   Schedule: {days_with_schedule}/{len(days)}")
    print(f"   Weather:  {days_with_weather}/{len(days)}")
    print(f"   Git:      {days_with_git}/{len(days)}")


if __name__ == '__main__':
    vault = os.environ.get('VAULT_PATH', '/Users/ivanakimkin/Documents/1')
    output = os.environ.get('OUTPUT_PATH', os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'metrics.json'
    ))

    # Git repos to scan
    git_base = '/Users/ivanakimkin/Projects'
    git_repos = []
    if os.path.isdir(git_base):
        for d in os.listdir(git_base):
            repo_path = os.path.join(git_base, d)
            if os.path.isdir(os.path.join(repo_path, '.git')):
                git_repos.append(repo_path)

    backfill(vault, output, git_repos=git_repos)
