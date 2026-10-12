import { shellQuote } from "../shell-quote";
import type { HostTarget } from "./platform";

export const SYSTEMD_UNIT = "superset-host.service";
export const LAUNCHD_LABEL = "sh.superset.host";

interface ServiceInput {
	binPath: string;
	organizationId: string;
}

/**
 * A systemd user unit. Runs `superset start` in the foreground so systemd
 * supervises it; KillMode=process keeps terminal sessions running when the
 * host restarts.
 */
export function systemdUnit({ binPath, organizationId }: ServiceInput): string {
	return `[Unit]
Description=Superset host

[Service]
ExecStart=${systemdWord(binPath)} start --org ${systemdWord(organizationId)}
Restart=on-failure
RestartSec=5
KillMode=process

[Install]
WantedBy=default.target
`;
}

/** One systemd command-line word: quoted, with `%` specifiers escaped. */
function systemdWord(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

function xmlEscape(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

/** A LaunchAgent that starts the host at login and restarts it if it exits. */
export function launchdPlist({
	binPath,
	organizationId,
}: ServiceInput): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${xmlEscape(binPath)}</string>
		<string>start</string>
		<string>--org</string>
		<string>${xmlEscape(organizationId)}</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
</dict>
</plist>
`;
}

export function serviceKind(target: HostTarget): "systemd" | "launchd" {
	return target.startsWith("darwin") ? "launchd" : "systemd";
}

const SYSTEMD_FILE = `"$HOME/.config/systemd/user/${SYSTEMD_UNIT}"`;
const LAUNCHD_FILE = `"$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"`;
const LAUNCHD_DOMAIN = `domain="gui/$(id -u)"; launchctl print "$domain" >/dev/null 2>&1 || domain="user/$(id -u)"`;

/**
 * Writes the service file and makes sure the service runs the current file
 * and binary. Prints `action=started|restarted|unchanged`. A host started
 * earlier with `--daemon` is stopped first, so two never run at once.
 */
export function installServiceScript({
	kind,
	binPath,
	organizationId,
	restart,
}: ServiceInput & { kind: "systemd" | "launchd"; restart: boolean }): string {
	const content =
		kind === "systemd"
			? systemdUnit({ binPath, organizationId })
			: launchdPlist({ binPath, organizationId });
	const file = kind === "systemd" ? SYSTEMD_FILE : LAUNCHD_FILE;
	const write = `set -e
bin=${shellQuote(binPath)}
file=${file}
mkdir -p "$(dirname "$file")"
new=$(cat <<'SUPERSET_SERVICE'
${content}SUPERSET_SERVICE
)
changed=${restart ? "yes" : "no"}
if [ "$(cat "$file" 2>/dev/null)" != "$new" ]; then echo "$new" > "$file"; changed=yes; fi
`;
	if (kind === "systemd") {
		return `${write}systemctl --user daemon-reload
systemctl --user enable ${SYSTEMD_UNIT} >/dev/null 2>&1
if systemctl --user is-active --quiet ${SYSTEMD_UNIT}; then
	if [ "$changed" = yes ]; then systemctl --user restart ${SYSTEMD_UNIT}; echo action=restarted; else echo action=unchanged; fi
else
	"$bin" stop --org ${shellQuote(organizationId)} >/dev/null 2>&1 || true
	systemctl --user start ${SYSTEMD_UNIT}
	echo action=started
fi
`;
	}
	return `${write}${LAUNCHD_DOMAIN}
if launchctl print "$domain/${LAUNCHD_LABEL}" >/dev/null 2>&1; then
	if [ "$changed" = yes ]; then
		launchctl bootout "$domain/${LAUNCHD_LABEL}" >/dev/null 2>&1 || true
		launchctl bootstrap "$domain" "$file"
		echo action=restarted
	else echo action=unchanged; fi
else
	"$bin" stop --org ${shellQuote(organizationId)} >/dev/null 2>&1 || true
	launchctl bootstrap "$domain" "$file"
	echo action=started
fi
`;
}

/** Stops and deletes whichever service `installServiceScript` set up. */
export function uninstallServiceScript(): string {
	return `systemd=${SYSTEMD_FILE}
if [ -f "$systemd" ]; then
	systemctl --user disable --now ${SYSTEMD_UNIT} >/dev/null 2>&1 || true
	rm -f "$systemd"
	systemctl --user daemon-reload >/dev/null 2>&1 || true
	echo removed=systemd
fi
launchd=${LAUNCHD_FILE}
if [ -f "$launchd" ]; then
	${LAUNCHD_DOMAIN}
	launchctl bootout "$domain/${LAUNCHD_LABEL}" >/dev/null 2>&1 || true
	rm -f "$launchd"
	echo removed=launchd
fi
`;
}
