export const HOSTS_SETTINGS_ROUTE = "/settings/hosts";

const SSH_URI =
	/^ssh:\/\/[A-Za-z0-9_][A-Za-z0-9._-]{0,255}@([A-Za-z0-9.-]{1,253})(?::([1-9][0-9]{0,4}))?$/;
const HOST_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * `ssh://user@host` or `ssh://user@host:port`, or null. Nothing else gets
 * through: no ssh options, passwords, paths, IPv6 or shell characters.
 */
export function parseSshUri(value: string): string | null {
	const match = SSH_URI.exec(value);
	if (!match) return null;
	const [, host, port] = match;
	if (!host.split(".").every((label) => HOST_LABEL.test(label))) return null;
	if (port !== undefined && Number(port) > 65535) return null;
	return value;
}

/**
 * `superset://settings/hosts?ssh=<ssh://user@host:port>` opens Set up a host
 * over SSH with the address filled in. `target` is null when the address is
 * not valid. Other links give null.
 */
export function readHostSetupLink(
	to: string,
	search: Record<string, string>,
): { target: string | null } | null {
	if (to.replace(/\/$/, "") !== HOSTS_SETTINGS_ROUTE) return null;
	if (search.ssh === undefined) return null;
	return { target: parseSshUri(search.ssh) };
}
