# Three repos, one reset: V1 overlay with packed-refs in the lower, V2 plain ext4, V3 overlay with packed-refs in the upper.
D=/mnt/superset-drive
pid=$(cat /run/superset-ovl.pid 2>/dev/null); ns=$(stat -L -c %i /proc/$pid/ns/mnt 2>/dev/null)
[ -n "$ns" ] && for p in /proc/[0-9]*; do [ "$(stat -L -c %i $p/ns/mnt 2>/dev/null)" = "$ns" ] && kill -9 ${p#/proc/} 2>/dev/null; done; sleep 1
if [ -n "${REMOUNT_OPTS:-}" ]; then dev=$(findmnt -no SOURCE $D); umount $D && mount -o "$REMOUNT_OPTS" $dev $D; echo "drive: $(findmnt -no OPTIONS $D)"; fi
if [ -n "${LOOP_OPTS:-}" ]; then
	L=/mnt/ovl-loop; mountpoint -q $L && umount $L; rm -f $D/upper.img; truncate -s 64G $D/upper.img; mkfs.ext4 -q -F $D/upper.img
	mkdir -p $L; mount -o "loop,$LOOP_OPTS" $D/upper.img $L; echo "upper fs: $(findmnt -no OPTIONS $L)"; export SUPERSET_DRIVE_DIR=$L
fi
rm -rf $D/overlay $D/ctl; superset-overlay-root enter true
G="GIT_AUTHOR_NAME=r GIT_AUTHOR_EMAIL=r@x GIT_COMMITTER_NAME=r GIT_COMMITTER_EMAIL=r@x HOME=/home/ubuntu"
install -d -o ubuntu -g ubuntu $D/ctl; runuser -u ubuntu -- env $G git clone -q --no-hardlinks /workspace $D/ctl/repo
superset-overlay-root run runuser -u ubuntu -- env $G git clone -q --no-hardlinks /workspace /home/ubuntu/v3
sync
cat > /run/refs-inner.sh <<'EOF'
for r in "$@"; do (cd $r && for b in a b c; do git branch -f rt-$b HEAD; done && git pack-refs --all && echo "$r $(wc -c < .git/packed-refs) $(sha256sum .git/packed-refs | cut -c1-12) $(git for-each-ref | wc -l)"); done
EOF
echo "before reset (repo bytes sha refs):"
superset-overlay-root run runuser -u ubuntu -- env $G bash /run/refs-inner.sh /workspace /home/ubuntu/v3
runuser -u ubuntu -- env $G bash /run/refs-inner.sh $D/ctl/repo
sleep 10; echo b > /proc/sysrq-trigger
