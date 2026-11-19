# check.sh <case>: after the wake, what survived and is the upper consistent.
C="$1"
echo "== kernel on mount"; dmesg | command grep -iE "ext4.*(recover|orphan|error)|overlayfs" | tail -6
echo "== workdir leftovers: $(find /mnt/superset-drive/overlay/work -mindepth 2 2>/dev/null | wc -l)  index entries: $(ls /mnt/superset-drive/overlay/work/index 2>/dev/null | wc -l)"
cat > /run/check-inner.sh <<'EOF'
C="$1"; cd /workspace; export PATH=$HOME/.bun/bin:$PATH GIT_AUTHOR_NAME=k GIT_AUTHOR_EMAIL=k@x GIT_COMMITTER_NAME=k GIT_COMMITTER_EMAIL=k@x
R=~/crash/record-$C; echo "record: $(tr '\n' ';' < $R 2>/dev/null | tail -c 300)"
want=$(command grep '^durable' $R | awk '{print $2}'); got=$(sha256sum ~/crash/durable-$C.bin 2>/dev/null | cut -c1-16)
echo "fsync'd 64 MB file: $([ "$want" = "$got" ] && echo intact || echo "LOST/CHANGED want=$want got=$got")"
echo "unsynced file: $(cat ~/crash/unsynced-$C.txt 2>&1 | head -c 60)"
case "$C" in
  k1) echo "node_modules entries: $(ls node_modules 2>/dev/null | wc -l)  cache entries: $(ls ~/.bun/install/cache 2>/dev/null | wc -l)"
      s=$(date +%s); bun install --frozen-lockfile > /tmp/k1b.log 2>&1; echo "bun install after crash: exit=$? $(( $(date +%s)-s ))s $(tail -1 /tmp/k1b.log)"
      node -e 'for (const m of ["react","zod","@trpc/server","drizzle-orm"]) require.resolve(m, {paths:["/workspace/apps/api"]}); console.log("modules resolve")' 2>&1 | tail -1 ;;
  k2) echo "branch: $(git branch --show-current) head: $(git log --oneline -1 2>&1 | head -c 80)"
      echo "index.lock left: $([ -e .git/index.lock ] && echo yes || echo no)"; rm -f .git/index.lock
      echo "fsck: $(git fsck --full --no-progress 2>&1 | head -3 | tr '\n' '|')"; echo "status lines: $(git status --porcelain 2>&1 | wc -l)"
      echo "files on disk: $(ls crashfiles 2>/dev/null | wc -l)"
      git add -A && git commit -qm "k2 retry" && echo "commit after crash: ok, $(git show --stat --format= HEAD | tail -1)" ;;
  k3) echo "last fsync'd record: $(command grep committed $R | tail -1)"
      echo "rows in db: $(sqlite3 ~/crash/k3.db 'select max(i) from t' 2>&1)  integrity: $(sqlite3 ~/crash/k3.db 'pragma integrity_check' 2>&1 | head -1)" ;;
  k4) f=$(command grep '^copyup' $R | awk '{print $2}'); n=$(command grep '^copyup' $R | awk '{print $3}')
      echo "file: $(stat -c %s "$f" 2>&1) bytes (was $n), sha now $(sha256sum "$f" 2>&1 | cut -c1-16), lower sha $(command grep lowersha $R | awk '{print $2}')"
      echo "rename: old=$(ls -d packages/sandbox 2>&1 | head -c 50) new=$(ls packages/sandbox-renamed-k4 2>/dev/null | wc -l) entries" ;;
  k5) f=$(command grep '^copyup' $R | awk '{print $2}'); n=$(command grep '^copyup' $R | awk '{print $3}')
      echo "pack: $(stat -c %s "$f" 2>&1) bytes (was $n), sha now $(sha256sum "$f" 2>&1 | cut -c1-16), lower sha $(command grep lowersha $R | awk '{print $2}')"
      echo "git fsck: $(git fsck --full --no-progress 2>&1 | head -3 | tr '\n' '|')ok-if-empty" ;;
esac
# Walk the whole upper through the overlay: every lookup must succeed.
errs=$(find / -xdev -newer /etc/hostname 2>&1 >/dev/null | command grep -vc "Permission denied"); echo "walk errors (not permission): $errs"
EOF
superset-overlay-root run runuser -u ubuntu -- env HOME=/home/ubuntu bash /run/check-inner.sh "$C"
echo "== kernel after walk"; dmesg | command grep -iE "overlayfs|ext4.*error|I/O error" | tail -4
