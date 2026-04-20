#!/bin/sh
# ============================================
# Garmin Connect — first-time login inside Docker
# ============================================
#
# Usage (after docker compose up -d):
#   docker compose exec life-dashboard-collector python3 /app/garmin_login.py
#
# This will prompt for email/password (or use env vars)
# and save tokens to /root/.garminconnect/ (persistent volume).
#
# After that, the cron collector will auto-refresh tokens.
# ============================================
echo ""
echo "Run this inside the collector container:"
echo "  docker compose exec -it life-dashboard-collector python3 /app/garmin_login.py"
echo ""
