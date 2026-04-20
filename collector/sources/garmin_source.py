"""
Garmin source — fetches health data from Garmin Connect.

Metrics collected per day:
- steps, distance
- body_battery (max)
- stress_avg
- resting_hr
- sleep_hours, sleep_score
- spo2_avg
- calories_total, calories_active
"""

import json
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, Optional


def init_garmin(email: str = None, password: str = None, token_dir: str = None):
    """
    Initialize Garmin Connect client.
    First call requires email+password, subsequent calls use saved tokens.
    """
    from garminconnect import Garmin

    email = email or os.environ.get('GARMIN_EMAIL')
    password = password or os.environ.get('GARMIN_PASSWORD')
    token_dir = token_dir or os.path.expanduser('~/.garminconnect')

    client = Garmin(email, password)
    client.login(token_dir)

    return client


def fetch_garmin_day(client, date_str: str) -> Optional[dict]:
    """
    Fetch all relevant health metrics for a single day.
    """
    result = {}

    # 1. Daily stats (steps, calories, distance)
    try:
        stats = client.get_stats(date_str)
        if stats:
            result['steps'] = stats.get('totalSteps')
            result['distance_m'] = stats.get('totalDistanceMeters')
            result['calories_total'] = stats.get('totalKilocalories')
            result['calories_active'] = stats.get('activeKilocalories')
            result['floors'] = stats.get('floorsAscended')
            result['resting_hr'] = stats.get('restingHeartRate')
            result['stress_avg'] = stats.get('averageStressLevel')
            result['max_stress'] = stats.get('maxStressLevel')
            result['body_battery_max'] = stats.get('bodyBatteryChargedValue')
            result['body_battery_min'] = stats.get('bodyBatteryDrainedValue')
    except Exception as e:
        print(f"  Stats error for {date_str}: {e}")

    # 2. Sleep data
    try:
        sleep = client.get_sleep_data(date_str)
        if sleep and sleep.get('dailySleepDTO'):
            s = sleep['dailySleepDTO']
            seconds = s.get('sleepTimeSeconds')
            if seconds:
                result['sleep_hours'] = round(seconds / 3600, 2)
            result['sleep_score'] = s.get('sleepScores', {}).get('overall', {}).get('value')

            # Sleep phases (deep, light, REM, awake)
            deep = s.get('deepSleepSeconds', 0) or 0
            light = s.get('lightSleepSeconds', 0) or 0
            rem = s.get('remSleepSeconds', 0) or 0
            awake = s.get('awakeSleepSeconds', 0) or 0
            result['sleep_phases'] = {
                'deep_h': round(deep / 3600, 2),
                'light_h': round(light / 3600, 2),
                'rem_h': round(rem / 3600, 2),
                'awake_h': round(awake / 3600, 2),
            }
    except Exception as e:
        print(f"  Sleep error for {date_str}: {e}")

    # 3. SpO2
    try:
        spo2 = client.get_spo2_data(date_str)
        if spo2:
            avg_val = spo2.get('averageSpO2')
            if avg_val:
                result['spo2_avg'] = avg_val
            result['spo2_low'] = spo2.get('lowestSpO2')
    except Exception as e:
        print(f"  SpO2 error for {date_str}: {e}")

    # 4. Heart rate
    try:
        hr = client.get_heart_rates(date_str)
        if hr:
            result['resting_hr'] = result.get('resting_hr') or hr.get('restingHeartRate')
            result['max_hr'] = hr.get('maxHeartRate')
            result['min_hr'] = hr.get('minHeartRate')
    except Exception as e:
        print(f"  HR error for {date_str}: {e}")

    # Clean up None values
    result = {k: v for k, v in result.items() if v is not None}

    return result if result else None


def fetch_garmin_range(client, start_date: str, end_date: str) -> Dict[str, dict]:
    """
    Fetch Garmin data for a date range.
    Garmin API only returns one day at a time, so we loop.
    """
    results = {}
    current = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    total = (end - current).days + 1

    i = 0
    while current <= end:
        i += 1
        date_str = current.strftime('%Y-%m-%d')
        print(f"  [{i}/{total}] {date_str}...", end='', flush=True)

        data = fetch_garmin_day(client, date_str)
        if data:
            results[date_str] = data
            steps = data.get('steps', '?')
            bb = data.get('body_battery_max', '?')
            print(f" steps={steps}, bb={bb}")
        else:
            print(" no data")

        current += timedelta(days=1)

    return results


def backfill_garmin(metrics_path: str, start_date: str = None, end_date: str = None):
    """
    Backfill Garmin data into existing metrics.json.
    """
    import json

    print("🏃 Garmin Connect — Backfill")
    print("=" * 50)

    # Init client
    print("Logging in to Garmin Connect...")
    client = init_garmin()
    print("✓ Logged in\n")

    # Load existing metrics
    with open(metrics_path, 'r', encoding='utf-8') as f:
        metrics = json.load(f)

    # Determine date range
    all_dates = sorted(metrics['days'].keys())
    if not start_date:
        start_date = all_dates[0]
    if not end_date:
        end_date = all_dates[-1]

    print(f"📅 Range: {start_date} → {end_date}")
    print(f"   ({(datetime.strptime(end_date, '%Y-%m-%d') - datetime.strptime(start_date, '%Y-%m-%d')).days + 1} days)\n")

    # Fetch
    garmin_data = fetch_garmin_range(client, start_date, end_date)
    print(f"\n✅ Got data for {len(garmin_data)} days")

    # Merge into metrics.json
    updated = 0
    for date_str, gdata in garmin_data.items():
        if date_str not in metrics['days']:
            metrics['days'][date_str] = {
                'date': date_str,
                'weekday': '?',
            }
        metrics['days'][date_str]['garmin'] = gdata
        updated += 1

    metrics['meta']['last_updated'] = datetime.now().isoformat()
    metrics['meta']['garmin_backfill'] = f'{start_date} → {end_date}'

    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    print(f"💾 Updated {updated} days in {metrics_path}")

    # Stats
    days_with_steps = sum(1 for d in garmin_data.values() if d.get('steps'))
    days_with_sleep = sum(1 for d in garmin_data.values() if d.get('sleep_hours'))
    days_with_bb = sum(1 for d in garmin_data.values() if d.get('body_battery_max'))

    print(f"\n📊 Garmin Coverage:")
    print(f"   Steps:        {days_with_steps}/{len(garmin_data)}")
    print(f"   Sleep:        {days_with_sleep}/{len(garmin_data)}")
    print(f"   Body Battery: {days_with_bb}/{len(garmin_data)}")


if __name__ == '__main__':
    metrics_path = os.environ.get('METRICS_PATH', os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'metrics.json'
    ))

    # Optional: custom date range
    start = sys.argv[1] if len(sys.argv) > 1 else None
    end = sys.argv[2] if len(sys.argv) > 2 else None

    backfill_garmin(metrics_path, start, end)
