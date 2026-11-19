#!/usr/bin/env bash
# tmpstress.sh <tmpsize>: re-enter the overlay with /tmp capped at <tmpsize>, run a heavy session, sample /tmp and memory.
SIZE="$1"; OUT=/var/tmp/tmp-$SIZE.csv
pid=$(cat /run/superset-ovl.pid 2>/dev/null); ns=$(stat -L -c %i /proc/$pid/ns/mnt 2>/dev/null)
[ -z "${SKIP_REENTER:-}" ] && [ -n "$ns" ] && for p in /proc/[0-9]*; do [ "$(stat -L -c %i $p/ns/mnt 2>/dev/null)" = "$ns" ] && kill -9 ${p#/proc/} 2>/dev/null; done; sleep 1
[ -n "${SKIP_REENTER:-}" ] || SUPERSET_TMP_SIZE=$SIZE superset-overlay-root enter true
echo "t,phase,tmp_used_mb,cgroup_mem_mb,shmem_mb" > $OUT
echo idle > /run/tmp-phase
( while :; do echo "$(date +%s),$(cat /run/tmp-phase),$(superset-overlay-root run df -m --output=used /tmp | tail -1 | tr -d ' '),$(( $(cat /sys/fs/cgroup/memory.current)/1048576 )),$(( $(awk '/^shmem /{print $2}' /sys/fs/cgroup/memory.stat)/1048576 ))" >> $OUT; sleep 1; done ) & S=$!
U=(HOME=/home/ubuntu USER=ubuntu PATH=/home/ubuntu/.bun/bin:/home/ubuntu/.local/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin CI=1)
run() { echo "$1" > /run/tmp-phase; local s=$(date +%s); superset-overlay-root run runuser -u ubuntu -- env -i "${U[@]}" bash -c "$2" > /var/tmp/tmp-$1.log 2>&1; echo "$1 exit=$? $(( $(date +%s)-s ))s $(tail -1 /var/tmp/tmp-$1.log | cut -c1-140)"; }
run pip-wheels 'python3 -m venv /home/ubuntu/venv && /home/ubuntu/venv/bin/pip install -q --no-binary :all: --no-cache-dir pyyaml==6.0.2 markupsafe==3.0.2 psutil==6.1.1 && /home/ubuntu/venv/bin/pip install -q --no-cache-dir -r /home/ubuntu/req.txt'
run go-build 'cd /home/ubuntu/fzf && go clean -cache && go build -a -o /home/ubuntu/fzf-bin .'
run chrome 'timeout 60 google-chrome --headless=new --no-sandbox --disable-gpu --dump-dom https://example.com > /dev/null'
run clone-install-in-tmp 'cd /tmp && rm -rf vite && git clone -q --depth 1 https://github.com/vitejs/vite.git && cd vite && npx -y pnpm@10 install --frozen-lockfile --ignore-scripts'
run bun-install-in-tmp 'cd /tmp && rm -rf ws && git clone -q --depth 1 https://github.com/paradevai/paradev.git ws && cd ws && bun install --frozen-lockfile'
echo idle > /run/tmp-phase; sleep 2; kill $S
echo "peak /tmp MB per phase:"; awk -F, 'NR>1 {if ($3>m[$2]) m[$2]=$3; if ($5>s[$2]) s[$2]=$5; if ($4>c[$2]) c[$2]=$4} END {for (k in m) printf "  %-22s tmp=%6d MB  shmem=%6d MB  cgroup=%6d MB\n", k, m[k], s[k], c[k]}' $OUT
