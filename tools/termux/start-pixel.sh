#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot restores the existing private services and saved PM2 processes.
set -eu
termux_prefix=${PREFIX:-/data/data/com.termux/files/usr}
export PATH="$termux_prefix/bin:$PATH"
pixel_cluster="$HOME/server/data/pixel-postgres"
pixel_logs="$HOME/server/logs"
mkdir -p "$pixel_logs"
termux-wake-lock >/dev/null 2>&1 || true
if ! pg_ctl -D "$pixel_cluster" status >/dev/null 2>&1; then
  pg_ctl -D "$pixel_cluster" -l "$pixel_logs/pixel-postgres.log" -w start
fi
if ! redis-cli -h 127.0.0.1 ping >/dev/null 2>&1; then
  redis-server --daemonize yes --bind 127.0.0.1 --protected-mode yes
fi
if ! pm2 describe pixel-backend >/dev/null 2>&1; then
  pm2 resurrect
fi
