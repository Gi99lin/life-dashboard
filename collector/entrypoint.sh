#!/bin/sh
# entrypoint.sh — Capture Docker env vars and inject into cron environment.
# Alpine's busybox crond does NOT inherit container env vars,
# so we dump them at startup and source them in the cron command.

ENV_FILE="/app/.env.runtime"

# Dump all current env vars (set by docker-compose) into a sourceable file
# Filter out problematic vars that shouldn't be re-exported
env | grep -vE '^(HOME=|USER=|HOSTNAME=|PATH=|PWD=|SHLVL=|_=)' | \
  sed 's/^\(.*\)=\(.*\)$/export \1="\2"/' > "$ENV_FILE"

# Also preserve PATH (python needs to be findable)
echo "export PATH=\"$PATH\"" >> "$ENV_FILE"

echo "[entrypoint] Captured $(wc -l < "$ENV_FILE") env vars → $ENV_FILE"

# Set up cron schedule: every 2 hours, source env first
echo "0 */2 * * * . /app/.env.runtime && cd /app && python3 /app/run_collect.py >> /var/log/collector.log 2>&1" > /etc/crontabs/root

echo "[entrypoint] Cron schedule:"
cat /etc/crontabs/root

# Run initial collection on startup so data is fresh immediately
echo "[entrypoint] Running initial collection..."
cd /app && python3 /app/run_collect.py >> /var/log/collector.log 2>&1
echo "[entrypoint] Initial collection done. Starting crond..."

# Start crond in foreground
exec crond -f -d 8
