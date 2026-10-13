/**
 * Prints one `key=value` line per fact about the remote machine. Written for
 * POSIX sh with no backslashes: ssh hands the quoted script to the user's
 * login shell first, and fish reads backslashes in single quotes.
 */
export const PROBE_SCRIPT = `
echo "system=$(uname -s)"
echo "machine=$(uname -m)"
echo "ldd=$(ldd --version 2>&1 | head -n 1)"
echo "machineid=$(cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null)"
echo "ioreg=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | grep IOPlatformUUID)"
echo "home=$HOME"
echo "user=$(id -un)"
echo "hostname=$(hostname)"
bin=""
for candidate in "$HOME/superset/bin/superset" "$(command -v superset 2>/dev/null)" /opt/homebrew/bin/superset /usr/local/bin/superset; do
	if [ -n "$candidate" ] && [ -x "$candidate" ]; then bin="$candidate"; break; fi
done
echo "bin=$bin"
if [ -n "$bin" ]; then
	echo "version=$("$bin" --version 2>/dev/null | head -n 1)"
	if [ -x "$(dirname "$bin")/superset-host" ]; then echo "hostRuntime=yes"; fi
fi
if command -v curl >/dev/null 2>&1; then echo "curl=yes"; fi
if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then echo "systemd=yes"; fi
if command -v loginctl >/dev/null 2>&1; then echo "linger=$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)"; fi
if command -v gh >/dev/null 2>&1; then
	if gh auth status >/dev/null 2>&1; then echo "gh=signed-in"; else echo "gh=signed-out"; fi
fi
`;

export interface RemoteFacts {
	system: string;
	machine: string;
	ldd: string;
	/** The raw id the host derives its host id from, as getMachineId reads it. */
	machineId: string;
	home: string;
	user: string;
	hostname: string;
	bin: string | null;
	version: string | null;
	/** False for the desktop app's bundled CLI, which cannot run a host. */
	hostRuntime: boolean;
	curl: boolean;
	systemd: boolean;
	linger: boolean | null;
	gh: "signed-in" | "signed-out" | null;
}

export function parseProbe(output: string): RemoteFacts {
	const facts = new Map<string, string>();
	for (const line of output.split("\n")) {
		const at = line.indexOf("=");
		if (at > 0) facts.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
	}
	const get = (key: string) => facts.get(key) ?? "";
	const system = get("system");
	const machineId =
		system === "Darwin"
			? (get("ioreg").match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1] ?? "")
			: get("machineid");
	const linger = get("linger");
	const gh = get("gh");
	return {
		system,
		machine: get("machine"),
		ldd: get("ldd"),
		machineId,
		home: get("home"),
		user: get("user"),
		hostname: get("hostname"),
		bin: get("bin") || null,
		version: get("version").match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null,
		hostRuntime: get("hostRuntime") === "yes",
		curl: get("curl") === "yes",
		systemd: get("systemd") === "yes",
		linger: linger === "yes" ? true : linger === "no" ? false : null,
		gh: gh === "signed-in" || gh === "signed-out" ? gh : null,
	};
}
