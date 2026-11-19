# arm.sh <case>: start work inside the overlay, record what is durable, then reset the VM mid-write.
C="$1"
cat > /run/arm-inner.sh <<'EOF'
C="$1"; cd /workspace; export PATH=$HOME/.bun/bin:$PATH GIT_AUTHOR_NAME=k GIT_AUTHOR_EMAIL=k@x GIT_COMMITTER_NAME=k GIT_COMMITTER_EMAIL=k@x
mkdir -p ~/crash; R=~/crash/record-$C
sync_note() { echo "$1" >> "$R"; python3 -c "import os; fd=os.open('$R', os.O_RDONLY); os.fsync(fd)"; }
# Always: one fsync'd file and one unsynced file, written just before the reset.
head -c 64M /dev/urandom > ~/crash/durable-$C.bin; python3 -c "import os; fd=os.open('$HOME/crash/durable-$C.bin', os.O_RDONLY); os.fsync(fd)"
sync_note "durable $(sha256sum ~/crash/durable-$C.bin | cut -c1-16)"
case "$C" in
  k1) rm -rf node_modules ~/.bun/install/cache; (bun install --frozen-lockfile > ~/crash/k1.log 2>&1 &) ; sleep 6 ;;
  k2) git switch -q -c crash-k2; mkdir -p crashfiles; for i in $(seq 1 20000); do echo "$i" > crashfiles/f$i; done
      git add -A; sync_note "staged $(git diff --cached --name-only | wc -l)"
      (git commit -qm "k2 big commit" > ~/crash/k2.log 2>&1 &); sleep 0.4 ;;
  k3) python3 - <<'P' &
import sqlite3, os
db = sqlite3.connect(os.path.expanduser("~/crash/k3.db")); db.execute("pragma journal_mode=wal"); db.execute("pragma synchronous=full")
db.execute("create table if not exists t(i integer, pad blob)")
r = open(os.path.expanduser("~/crash/record-k3"), "a")
for i in range(10**9):
    db.execute("insert into t values(?, randomblob(4000))", (i,)); db.commit()
    if i % 50 == 0: r.write(f"committed {i}\n"); r.flush(); os.fsync(r.fileno())
P
      sleep 4 ;;
  k4) f=$(ls -S /workspace/node_modules/.bun/*/node_modules/*/*.node 2>/dev/null | head -1); [ -n "$f" ] || f=/workspace/.git/objects/pack/$(ls -S /workspace/.git/objects/pack | head -1)
      sync_note "copyup $f $(stat -c %s "$f")"; sync_note "lowersha $(sha256sum "$f" | cut -c1-16)"
      (python3 -c "import os; fd=os.open('$f', os.O_RDWR); os.pwrite(fd, os.pread(fd,1,0), 0); os.fsync(fd)" &)
      mv packages/sandbox packages/sandbox-renamed-k4; sleep 0.05 ;;
  k5) f=/workspace/.git/objects/pack/$(ls -S /workspace/.git/objects/pack | command grep pack$ | head -1)
      sync_note "copyup $f $(stat -c %s "$f")"; sync_note "lowersha $(sha256sum "$f" | cut -c1-16)"; sync
      (python3 -c "import os; fd=os.open('$f', os.O_RDWR); os.pwrite(fd, os.pread(fd,1,0), 0); os.fsync(fd)" &)
      sleep 0.05 ;;
esac
echo "$C unsynced" > ~/crash/unsynced-$C.txt
EOF
superset-overlay-root run runuser -u ubuntu -- env HOME=/home/ubuntu bash /run/arm-inner.sh "$C"
echo "resetting at $(date +%s%3N)"
echo b > /proc/sysrq-trigger
