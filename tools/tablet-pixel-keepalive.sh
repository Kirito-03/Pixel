#!/data/data/com.termux/files/usr/bin/bash
# Restore only Pixel processes and its existing read-only Drive bridge.
set -eu
export PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
export PATH="$PREFIX/bin:$PATH"
mkdir -p "$HOME/server/logs"
exec 9>"$HOME/server/logs/pixel-keepalive.lock"
flock -n 9 || exit 0
service="$PREFIX/var/service/rclone-drive"
if [ -x "$service/run" ]; then
  if ! sv status "$service" >/dev/null 2>&1; then
    nohup runsv "$service" </dev/null >>"$HOME/server/logs/rclone-drive-supervisor.log" 2>&1 9>&- &
  else
    sv up "$service" >/dev/null 2>&1 || true
  fi
fi
# Query the manager state, rather than restarting a slow healthy HTTP request.
missing=$(pm2 jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const p=JSON.parse(s);console.log(["pixel-backend","pixel-media-worker"].some(n=>!p.some(x=>x.name===n&&x.pm2_env.status==="online"))?"yes":"no")})')
if [ "$missing" = yes ]; then
  bash "$HOME/server/start-pixel.sh"
fi
