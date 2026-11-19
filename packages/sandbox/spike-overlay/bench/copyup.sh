#!/usr/bin/env bash
# Spike: cost of the first write to a large file that sits in the lower layer. copyup.sh A|C
set -uo pipefail
L="$1"
OUT=/var/tmp/copyup.csv
D=/var/tmp/cu
as_user() {
	if [ "$L" = C ]; then superset-overlay-root run runuser -u ubuntu -- env HOME=/home/ubuntu python3 -I -c "$1"
	else runuser -u ubuntu -- env HOME=/home/ubuntu python3 -I -c "$1"; fi
}
if [ "$L" = C ]; then
	# The lower may only change while no overlay uses it.
	ns=$(stat -L -c %i "/proc/$(cat /run/superset-ovl.pid)/ns/mnt")
	for p in /proc/[0-9]*; do [ "$(stat -L -c %i "$p/ns/mnt" 2>/dev/null)" = "$ns" ] && kill -9 "${p#/proc/}" 2>/dev/null; done
	sleep 1
fi
rm -rf "$D"; install -d -o ubuntu -g ubuntu "$D"
for size in 100 500 2000; do for i in 1 2 3; do
	head -c "${size}M" /dev/urandom > "$D/f${size}_$i"; head -c "${size}M" /dev/urandom > "$D/g${size}_$i"
done; done
chown ubuntu:ubuntu "$D"/*; sync
[ "$L" = C ] && superset-overlay-root enter true
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
echo "layout,file_mb,run,first_inplace_s,second_inplace_s,atomic_save_s" > "$OUT"
for size in 100 500 2000; do for i in 1 2 3; do
	as_user "
import os, time
def inplace(p):
    s = time.perf_counter(); fd = os.open(p, os.O_RDWR); os.pwrite(fd, b'x', 0); os.fsync(fd); os.close(fd); return time.perf_counter() - s
def atomic(p):
    # What most editors do on save: write a new file, then rename it over the old one.
    s = time.perf_counter(); data = open(p, 'rb').read(); t = p + '.tmp'
    with open(t, 'wb') as f: f.write(data); f.flush(); os.fsync(f.fileno())
    os.rename(t, p); return time.perf_counter() - s
a = inplace('$D/f${size}_$i'); b = inplace('$D/f${size}_$i'); c = atomic('$D/g${size}_$i')
print('$L,$size,$i,%.3f,%.3f,%.3f' % (a, b, c))
" >> "$OUT"
done; done
cat "$OUT"
