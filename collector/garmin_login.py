"""
Garmin Connect Login — one-time interactive script.
After successful login, tokens are saved to ~/.garminconnect/garmin_tokens.json
and all subsequent calls will use auto-refresh.

Usage:
  GARMIN_EMAIL=your@email.com GARMIN_PASSWORD=yourpass python3 garmin_login.py
  
Or run without env vars to enter credentials interactively.
"""

import os
import sys
import getpass
from garminconnect import Garmin


def main():
    email = os.environ.get('GARMIN_EMAIL')
    password = os.environ.get('GARMIN_PASSWORD')

    if not email:
        email = input("Garmin Connect email: ").strip()
    if not password:
        password = getpass.getpass("Garmin Connect password: ")

    token_dir = os.path.expanduser("~/.garminconnect")

    print(f"\n🔐 Logging in as {email}...")
    print(f"   Token dir: {token_dir}")

    try:
        client = Garmin(
            email,
            password,
            prompt_mfa=lambda: input("🔑 MFA code: ").strip(),
        )
        client.login(token_dir)
        print("✅ Login successful! Tokens saved.\n")

        # Quick test
        from datetime import date
        today = date.today().isoformat()
        stats = client.get_stats(today)
        if stats:
            print(f"📊 Today's stats ({today}):")
            print(f"   Steps: {stats.get('totalSteps', '?')}")
            print(f"   Distance: {stats.get('totalDistanceMeters', 0):.0f}m")
            print(f"   Calories: {stats.get('totalKilocalories', '?')}")
            print(f"   Resting HR: {stats.get('restingHeartRate', '?')}")
            print(f"   Body Battery: {stats.get('bodyBatteryChargedValue', '?')}")
            print(f"   Avg Stress: {stats.get('averageStressLevel', '?')}")
        else:
            print("⚠ No stats available for today (might not have synced yet)")

    except Exception as e:
        print(f"❌ Login failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
