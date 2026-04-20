"""
Schedule source — парсер schedules .md файлов из Obsidian vault.

Формат файла:
  # ДЕНЬ_НЕДЕЛИ — ДД месяц ГГГГ
  | Время | Активность | Статус |
  |-------|------------|--------|
  | 09:00-13:00 | Работа | ✅ |
"""

import re
import os
import glob
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional, Tuple


# Классификация активностей по ключевым словам
ACTIVITY_CATEGORIES = {
    'work': [
        'работа', 'работа в офисе', 'работа (фокус)', 'рабочий созвон',
        'созвон', 'стендап', 'планёрка', 'митинг',
    ],
    'projects': [
        'проект', 'проекты', 'пет-проект',
    ],
    'games': [
        'игры', 'игра',
    ],
    'rest': [
        'отдых', 'прогулка', 'вождение', 'психоаналитик',
        'подготовка ко сну', 'подъём', 'утренний туалет',
        'подъём и утро', 'подъём и гигиена', 'подъём + туалет',
    ],
    'food': [
        'завтрак', 'обед', 'ужин', 'еда', 'обед 🍽', 'ужин + отдых',
        'завтрак в офисе',
    ],
    'commute': [
        'дорога', 'дорога в офис', 'дорога домой', 'дорога до офиса',
    ],
    'sleep': [
        'сон',
    ],
}


def classify_activity(activity_text: str) -> str:
    """Classify an activity into a category by matching keywords."""
    # Strip emoji and extra whitespace
    clean = re.sub(r'[\U0001f300-\U0001f9ff]', '', activity_text).strip().lower()
    # Remove parenthetical notes for matching
    clean_base = re.split(r'\s*\(', clean)[0].strip()

    for category, keywords in ACTIVITY_CATEGORIES.items():
        for kw in keywords:
            if clean_base == kw or clean.startswith(kw):
                return category

    # Fuzzy fallback: check if any keyword is contained
    for category, keywords in ACTIVITY_CATEGORIES.items():
        for kw in keywords:
            if kw in clean:
                return category

    return 'rest'  # Default: unclassified → rest


def parse_time_range(time_str: str) -> Optional[Tuple[float, float]]:
    """
    Parse a time range string like '09:00-13:00' into (start_minutes, end_minutes).
    Handles 'HH:MM-HH:MM', 'HH:MM-...' (open-ended), and single times 'HH:MM'.
    Returns minutes from midnight for start and end, or None if unparseable.
    """
    time_str = time_str.strip()

    # Single timestamp like "09:08" (marker, not a range)
    if re.match(r'^\d{2}:\d{2}$', time_str):
        return None

    # Range: HH:MM-HH:MM or HH:MM-...
    match = re.match(r'(\d{2}):(\d{2})\s*[-–]\s*(?:(\d{2}):(\d{2})|\.\.\.)', time_str)
    if not match:
        return None

    start_h, start_m = int(match.group(1)), int(match.group(2))
    start_mins = start_h * 60 + start_m

    if match.group(3) is None:
        # Open-ended (e.g., "00:00-...") — skip
        return None

    end_h, end_m = int(match.group(3)), int(match.group(4))
    end_mins = end_h * 60 + end_m

    # Handle midnight crossover (e.g., 22:00-01:00)
    if end_mins < start_mins:
        end_mins += 24 * 60

    return (start_mins, end_mins)


def parse_schedule_file(filepath: str) -> Optional[dict]:
    """
    Parse a single schedule .md file and return structured data.

    Returns:
        {
            'date': '2026-03-19',
            'wake_time': '07:19',
            'hours_work': 6.5,
            'hours_projects': 1.5,
            'hours_games': 0.0,
            'hours_rest': 2.0,
            'hours_food': 1.25,
            'hours_commute': 1.5,
            'hours_productive': 8.0,
            'hours_sleep': 7.5,
        }
    """
    # Extract date from filename
    basename = os.path.basename(filepath)
    date_match = re.match(r'(\d{4}-\d{2}-\d{2})', basename)
    if not date_match:
        return None

    date_str = date_match.group(1)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except IOError:
        return None

    # Parse table rows
    # Match lines like: | 09:00-13:00 | Работа | ✅ |
    row_pattern = re.compile(
        r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|'
    )

    categories = {
        'work': 0.0,
        'projects': 0.0,
        'games': 0.0,
        'rest': 0.0,
        'food': 0.0,
        'commute': 0.0,
        'sleep': 0.0,
    }

    wake_time = None

    for line in content.split('\n'):
        match = row_pattern.match(line.strip())
        if not match:
            continue

        time_col = match.group(1).strip()
        activity_col = match.group(2).strip()

        # Skip header rows
        if time_col.lower() in ('время', '---', '-----------', '-------'):
            continue
        if re.match(r'^[-\s]+$', time_col):
            continue

        # Detect wake time
        activity_lower = activity_col.lower()
        if any(w in activity_lower for w in ['подъём', 'подъем', 'подъeм']):
            # Extract the earliest time from this row
            t_match = re.match(r'(\d{2}:\d{2})', time_col)
            if t_match and wake_time is None:
                wake_time = t_match.group(1)

        # Parse time range
        time_range = parse_time_range(time_col)
        if time_range is None:
            continue

        start_mins, end_mins = time_range
        duration_hours = (end_mins - start_mins) / 60.0

        if duration_hours <= 0:
            continue

        category = classify_activity(activity_col)
        categories[category] += duration_hours

    # If no explicit wake time found, infer from first non-sleep activity
    if wake_time is None:
        for line in content.split('\n'):
            match = row_pattern.match(line.strip())
            if not match:
                continue
            time_col = match.group(1).strip()
            activity_col = match.group(2).strip()
            if re.match(r'^[-\s]+$', time_col) or time_col.lower() == 'время':
                continue
            category = classify_activity(activity_col)
            if category != 'sleep':
                t_match = re.match(r'(\d{2}:\d{2})', time_col)
                if t_match:
                    wake_time = t_match.group(1)
                    break

    return {
        'date': date_str,
        'wake_time': wake_time,
        'hours_work': round(categories['work'] + categories['commute'], 2),  # commute merged with work
        'hours_projects': round(categories['projects'], 2),
        'hours_games': round(categories['games'], 2),
        'hours_rest': round(categories['rest'], 2),
        'hours_food': round(categories['food'], 2),
        'hours_commute': round(categories['commute'], 2),  # keep raw for reference
        'hours_productive': round(categories['work'] + categories['commute'] + categories['projects'], 2),
        'hours_sleep': round(categories['sleep'], 2),
    }


def collect_all_schedules(vault_path: str) -> Dict[str, dict]:
    """
    Find and parse all schedule files in the vault.

    Args:
        vault_path: Path to the Obsidian vault root

    Returns:
        Dict keyed by date string, e.g. {'2026-03-19': {...}, ...}
    """
    results = {}
    patterns = [
        os.path.join(vault_path, 'Жизнь', 'Daily', '**', '*-schedules.md'),
        os.path.join(vault_path, 'Жизнь', 'Daily', '*-schedules.md'),
    ]

    files = set()
    for pattern in patterns:
        files.update(glob.glob(pattern, recursive=True))

    for filepath in sorted(files):
        parsed = parse_schedule_file(filepath)
        if parsed:
            results[parsed['date']] = parsed

    return results


if __name__ == '__main__':
    import json
    import sys

    vault = sys.argv[1] if len(sys.argv) > 1 else '/Users/ivanakimkin/Documents/1'

    data = collect_all_schedules(vault)
    print(f"Parsed {len(data)} schedule files")
    print(json.dumps(data, indent=2, ensure_ascii=False))
