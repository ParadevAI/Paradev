#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
	echo "usage: $0 <file.deb>..." >&2
	exit 2
fi

status=0
for deb in "$@"; do
	listing=$(dpkg-deb -c "$deb")
	writable=$(awk 'substr($1, 1, 1) != "l" && substr($1, 9, 1) == "w"' <<<"$listing")
	if [ -n "$writable" ]; then
		echo "::error::$deb has $(wc -l <<<"$writable") world-writable paths:"
		echo "$writable"
		status=1
	else
		echo "OK: $deb has no world-writable paths"
	fi
done
exit "$status"
