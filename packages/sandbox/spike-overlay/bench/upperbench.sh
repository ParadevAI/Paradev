#!/usr/bin/env bash
# Spike: the same small benchmark on A (no overlay), C (upper on the drive) and C-loop
# (upper on an ext4 image in a file on the drive, mounted nodelalloc). upperbench.sh A|C|CL
set -uo pipefail
L="$1"; OUT=/var/tmp/upperbench.csv; D=/mnt/superset-drive; LOOP=/mnt/ovl-loop
U=(HOME=/home/ubuntu USER=ubuntu PATH=/home/ubuntu/.bun/bin:/usr/local/bin:/usr/bin:/bin)
as_user() {
	if [ "$L" = A ]; then runuser -u ubuntu -- env -i "${U[@]}" "$@"
	else superset-overlay-root run runuser -u ubuntu -- env -i "${U[@]}" "$@"; fi
}
kill_ns() {
	local ns p; ns=$(stat -L -c %i "/proc/$(cat /run/superset-ovl.pid 2>/dev/null)/ns/mnt" 2>/dev/null) || return 0
	for p in /proc/[0-9]*; do [ "$(stat -L -c %i "$p/ns/mnt" 2>/dev/null)" = "$ns" ] && kill -9 "${p#/proc/}" 2>/dev/null; done; sleep 1
}
fresh() {
	[ "$L" = A ] && return 0
	kill_ns
	if [ "$L" = CL ]; then
		mountpoint -q $LOOP && umount $LOOP; rm -f $D/upper.img; truncate -s 64G $D/upper.img; mkfs.ext4 -q -F $D/upper.img
		mkdir -p $LOOP; mount -o loop,noatime,nodelalloc $D/upper.img $LOOP; SUPERSET_DRIVE_DIR=$LOOP superset-overlay-root enter true
	else
		rm -rf $D/overlay; superset-overlay-root enter true
	fi
}
t() { local s e; s=$(date +%s%N); as_user bash -c "$2" > /var/tmp/ub.out 2>&1; local rc=$?; e=$(date +%s%N)
	printf '%s,%s,%s,%.2f,%s\n' "$L" "$1" "$r" "$(awk -v a=$s -v b=$e "BEGIN{print (b-a)/1e9}")" "$rc" >> "$OUT"; }
[ -f "$OUT" ] || echo "layout,item,run,seconds,exit" > "$OUT"
for r in 1 2 3; do
	fresh; echo 3 > /proc/sys/vm/drop_caches
	t first-reinstall-CI 'cd /workspace && rm -rf node_modules && CI=1 bun install --frozen-lockfile'
	t warm-reinstall-CI 'cd /workspace && rm -rf node_modules && CI=1 bun install --frozen-lockfile'
	t warm-reinstall-postinstall 'cd /workspace && rm -rf node_modules && bun install --frozen-lockfile'
	t cold-install-CI 'cd /workspace && rm -rf node_modules ~/.bun/install/cache && CI=1 bun install --frozen-lockfile'
	as_user bash -c 'cd /workspace && git ls-files "packages/*.ts" | head -300 | while read -r f; do echo "//x" >> "$f"; done'
	t git-status-dirty 'cd /workspace && git status --porcelain | wc -l'
	as_user bash -c 'cd /workspace && git checkout -q -- .'
	t rg-all-files 'cd /workspace && rg -uu -c --no-messages function . | wc -l'
	t write-2GB-fsync 'dd if=/dev/zero of=/home/ubuntu/ub.bin bs=1M count=2000 conv=fsync status=none; rm -f /home/ubuntu/ub.bin'
	t fsync-4k-x2000 'python3 -I -c "
import os
fd = os.open(\"/home/ubuntu/ub.sync\", os.O_WRONLY | os.O_CREAT)
for _ in range(2000): os.pwrite(fd, b\"x\" * 4096, 0); os.fsync(fd)
os.unlink(\"/home/ubuntu/ub.sync\")"'
done
# Without CI the repo's postinstall rebuilds the desktop's native modules; once per layout, from a fresh upper.
r=1; fresh; echo 3 > /proc/sys/vm/drop_caches
t first-reinstall-postinstall 'cd /workspace && rm -rf node_modules && bun install --frozen-lockfile'
cat "$OUT"
