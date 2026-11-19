#!/usr/bin/env bash
# Spike, layout C only: the first `bun install` after a create, when the cache and node_modules
# are still the golden's (lower). Each run starts from an empty upper. Then raw device speed.
set -uo pipefail
OUT=/var/tmp/firstinstall.csv
DRIVE=/mnt/superset-drive
U="HOME=/home/ubuntu PATH=/home/ubuntu/.bun/bin:/usr/local/bin:/usr/bin:/bin"
kill_ns() {
	local ns p; ns=$(stat -L -c %i "/proc/$(cat /run/superset-ovl.pid)/ns/mnt" 2>/dev/null) || return 0
	for p in /proc/[0-9]*; do [ "$(stat -L -c %i "$p/ns/mnt" 2>/dev/null)" = "$ns" ] && kill -9 "${p#/proc/}" 2>/dev/null; done
	sleep 1
}
echo "run,seconds,upper_gb_after,exit" > "$OUT"
for r in 1 2 3; do
	kill_ns
	rm -rf "$DRIVE/overlay"
	superset-overlay-root enter true
	echo 3 > /proc/sys/vm/drop_caches
	s=$(date +%s%N)
	superset-overlay-root run runuser -u ubuntu -- env $U bash -c 'cd /workspace && rm -rf node_modules && bun install --frozen-lockfile' > /var/tmp/fi.out 2>&1; rc=$?
	e=$(date +%s%N)
	printf '%s,%.2f,%s,%s\n' "$r" "$(echo "($e-$s)/1000000000" | bc -l)" "$(du -sx --block-size=1M "$DRIVE/overlay/upper" | awk '{printf "%.2f", $1/1024}')" "$rc" >> "$OUT"
done
# Raw device speed: 2 GB written with fsync, then read back cold, on the root disk and on the drive.
echo "device,write_MBps,read_MBps,fsync_4k_per_s" > /var/tmp/devices.csv
for target in /var/tmp/devtest "$DRIVE/devtest"; do
	w=$(dd if=/dev/zero of="$target" bs=1M count=2000 conv=fsync 2>&1 | awk '/copied/ {print $(NF-1) $NF}')
	echo 3 > /proc/sys/vm/drop_caches
	rd=$(dd if="$target" of=/dev/null bs=1M 2>&1 | awk '/copied/ {print $(NF-1) $NF}')
	f=$(python3 -I -c "
import os, time
fd = os.open('$target.sync', os.O_WRONLY | os.O_CREAT); n = 0; s = time.perf_counter()
while time.perf_counter() - s < 3: os.pwrite(fd, b'x' * 4096, 0); os.fsync(fd); n += 1
print(round(n / (time.perf_counter() - s)))")
	echo "$(findmnt -no SOURCE -T "$target"),$w,$rd,$f" >> /var/tmp/devices.csv
	rm -f "$target" "$target.sync"
done
cat "$OUT" /var/tmp/devices.csv
