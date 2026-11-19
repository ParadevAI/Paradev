D=/mnt/superset-drive
if [ -f $D/upper.img ]; then
	pid=$(cat /run/superset-ovl.pid 2>/dev/null); ns=$(stat -L -c %i /proc/$pid/ns/mnt 2>/dev/null)
	[ -n "$ns" ] && for p in /proc/[0-9]*; do [ "$(stat -L -c %i $p/ns/mnt 2>/dev/null)" = "$ns" ] && kill -9 ${p#/proc/} 2>/dev/null; done; sleep 1
	mkdir -p /mnt/ovl-loop; mount -o loop,${LOOP_OPTS:-nodelalloc} $D/upper.img /mnt/ovl-loop; dmesg | command grep -E "loop.*recovery|EXT4-fs \(loop" | tail -2
	SUPERSET_DRIVE_DIR=/mnt/ovl-loop superset-overlay-root enter true
fi
c() { echo "$1 packed-refs=$(wc -c < $2/.git/packed-refs 2>&1) refs=$(git -C $2 for-each-ref 2>/dev/null | wc -l) fsck=$(git -C $2 fsck --no-progress 2>&1 | head -1 | cut -c1-70)"; }
superset-overlay-root run runuser -u ubuntu -- env HOME=/home/ubuntu bash -c "$(declare -f c); c V1-overlay-lower /workspace; c V3-overlay-upper /home/ubuntu/v3"
runuser -u ubuntu -- env HOME=/home/ubuntu bash -c "$(declare -f c); c V2-plain-ext4 $D/ctl/repo"
