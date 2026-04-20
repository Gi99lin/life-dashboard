"""
Weather source — Open-Meteo API (бесплатный, без ключа).
Получает историческую и текущую погоду по координатам.
"""

import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from typing import Dict, Optional


# Moscow coordinates by default
DEFAULT_LAT = 55.7558
DEFAULT_LON = 37.6173

# WMO weather codes → description + icon
WMO_CODES = {
    0: ('Ясно', '☀️'),
    1: ('Малооблачно', '🌤'),
    2: ('Облачно', '⛅'),
    3: ('Пасмурно', '☁️'),
    45: ('Туман', '🌫'),
    48: ('Изморось', '🌫'),
    51: ('Морось', '🌧'),
    53: ('Морось', '🌧'),
    55: ('Сильная морось', '🌧'),
    56: ('Ледяная морось', '🌧'),
    57: ('Сильная ледяная морось', '🌧'),
    61: ('Дождь', '🌧'),
    63: ('Умеренный дождь', '🌧'),
    65: ('Сильный дождь', '🌧'),
    66: ('Ледяной дождь', '🌧'),
    67: ('Сильный ледяной дождь', '🌧'),
    71: ('Снег', '🌨'),
    73: ('Умеренный снег', '🌨'),
    75: ('Сильный снег', '🌨'),
    77: ('Снежная крупа', '🌨'),
    80: ('Ливень', '🌧'),
    81: ('Сильный ливень', '🌧'),
    82: ('Штормовой ливень', '🌧'),
    85: ('Снежный ливень', '🌨'),
    86: ('Сильный снежный ливень', '🌨'),
    95: ('Гроза', '⛈'),
    96: ('Гроза с градом', '⛈'),
    99: ('Гроза с сильным градом', '⛈'),
}


def fetch_weather(date_str: str, lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON) -> Optional[dict]:
    """
    Fetch weather data for a specific date from Open-Meteo API.

    Returns:
        {'temp': 14.2, 'desc': 'Облачно', 'icon': '☁️', 'pressure': 1018}
    """
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&daily=temperature_2m_mean,weathercode,surface_pressure_mean"
        f"&start_date={date_str}&end_date={date_str}"
        f"&timezone=auto"
    )

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LifeDashboard/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None

    daily = data.get('daily', {})
    if not daily or not daily.get('time'):
        return None

    temp = daily.get('temperature_2m_mean', [None])[0]
    code = daily.get('weathercode', [0])[0]
    pressure = daily.get('surface_pressure_mean', [None])[0]

    desc, icon = WMO_CODES.get(code, ('Неизвестно', '❓'))

    return {
        'temp': round(temp, 1) if temp is not None else None,
        'desc': desc,
        'icon': icon,
        'pressure': round(pressure) if pressure is not None else None,
    }


def _fetch_weather_chunk(start_date: str, end_date: str,
                         lat: float, lon: float, use_archive: bool = False) -> Dict[str, dict]:
    """Fetch weather for a single chunk (max ~90 days)."""
    base = "https://archive-api.open-meteo.com/v1/archive" if use_archive else "https://api.open-meteo.com/v1/forecast"
    url = (
        f"{base}?"
        f"latitude={lat}&longitude={lon}"
        f"&daily=temperature_2m_mean,weathercode,surface_pressure_mean"
        f"&start_date={start_date}&end_date={end_date}"
        f"&timezone=auto"
    )

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LifeDashboard/1.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        print(f"  Weather API error ({start_date}→{end_date}): {e}")
        return {}

    daily = data.get('daily', {})
    dates = daily.get('time', [])
    temps = daily.get('temperature_2m_mean', [])
    codes = daily.get('weathercode', [])
    pressures = daily.get('surface_pressure_mean', [])

    results = {}
    for i, date in enumerate(dates):
        code = codes[i] if i < len(codes) else 0
        desc, icon = WMO_CODES.get(code, ('Неизвестно', '❓'))

        temp = temps[i] if i < len(temps) else None
        pressure = pressures[i] if i < len(pressures) else None

        results[date] = {
            'temp': round(temp, 1) if temp is not None else None,
            'desc': desc,
            'icon': icon,
            'pressure': round(pressure) if pressure is not None else None,
        }

    return results


def fetch_weather_range(start_date: str, end_date: str,
                        lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON) -> Dict[str, dict]:
    """
    Fetch weather for a date range, splitting into 90-day chunks.
    Uses archive API for historical data, forecast API for recent dates.
    """
    results = {}
    chunk_days = 90

    current = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    today = datetime.now()
    # Archive API works up to ~5 days ago
    archive_cutoff = today - timedelta(days=7)

    while current <= end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end)
        s = current.strftime('%Y-%m-%d')
        e = chunk_end.strftime('%Y-%m-%d')

        use_archive = chunk_end < archive_cutoff
        chunk = _fetch_weather_chunk(s, e, lat, lon, use_archive=use_archive)
        results.update(chunk)

        current = chunk_end + timedelta(days=1)

    return results


if __name__ == '__main__':
    import sys
    date = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime('%Y-%m-%d')
    result = fetch_weather(date)
    print(json.dumps(result, indent=2, ensure_ascii=False))
