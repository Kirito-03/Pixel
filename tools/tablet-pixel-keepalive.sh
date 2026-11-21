#!/data/data/com.termux/files/usr/bin/bash
# Restore Pixel processes, nginx, cloudflared, microsocks, and the read-only Drive bridge.
set -eu
export PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
export HOME=${HOME:-/data/data/com.termux/files/home}
export PATH="$PREFIX/bin:$PATH"
if [ -f "$PREFIX/lib/libtermux-exec-ld-preload.so" ]; then
  export LD_PRELOAD="$PREFIX/lib/libtermux-exec-ld-preload.so"
fi
mkdir -p "$HOME/server/logs"
exec 9>"$HOME/server/logs/pixel-keepalive.lock"
flock -n 9 || exit 0
pgrep -x nginx >/dev/null || nginx </dev/null >/dev/null 2>&1 || true
pgrep -f "microsocks -p 1080" >/dev/null || (nohup microsocks -p 1080 </dev/null >/dev/null 2>&1 9>&- &)
if [ -f "$HOME/.cloudflared/token" ]; then
  pgrep -f "[c]loudflared tunnel" >/dev/null || (nohup env -u LD_PRELOAD GODEBUG=netdns=go proot -b "$PREFIX/etc/hosts:/etc/hosts" cloudflared tunnel --no-autoupdate --edge-ip-version 4 --protocol http2 run --token-file "$HOME/.cloudflared/token" </dev/null >>"$HOME/server/logs/cloudflared.log" 2>&1 9>&- &)
elif [ -f "$HOME/server/config/cloudflare_tunnel.token" ]; then
  pgrep -f "[c]loudflared tunnel" >/dev/null || (nohup env -u LD_PRELOAD GODEBUG=netdns=go proot -b "$PREFIX/etc/hosts:/etc/hosts" cloudflared tunnel --no-autoupdate --edge-ip-version 4 --protocol http2 run --token "$(cat "$HOME/server/config/cloudflare_tunnel.token")" </dev/null >>"$HOME/server/logs/cloudflared.log" 2>&1 9>&- &)
fi
service="$PREFIX/var/service/rclone-drive"
if [ -x "$service/run" ]; then
  if ! sv status "$service" >/dev/null 2>&1; then
    nohup runsv "$service" </dev/null >>"$HOME/server/logs/rclone-drive-supervisor.log" 2>&1 9>&- &
  else
    sv up "$service" >/dev/null 2>&1 || true
  fi
fi
# Query the manager state, rather than restarting a slow healthy HTTP request.
missing=$(node "$PREFIX/bin/pm2" jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const p=JSON.parse(s);console.log(["pixel-backend","pixel-media-worker"].some(n=>!p.some(x=>x.name===n&&x.pm2_env.status==="online"))?"yes":"no")})')
if [ "$missing" = yes ]; then
  bash "$HOME/server/start-pixel.sh"
fi
