/** Whether a URL host names a loopback, private, link-local or otherwise internal destination. Checks the literal host only; DNS is not resolved. */
export function isInternalHost(hostname: string): boolean {
	const host = hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.+$/, "");
	if (host.includes(":")) {
		return (
			host.startsWith("::") ||
			/^f[cd]/.test(host) ||
			/^fe[89ab]/.test(host) ||
			host.startsWith("64:ff9b:")
		);
	}
	if (!host.includes(".")) return true;
	if (
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		host.endsWith(".home.arpa")
	) {
		return true;
	}
	const octets = host.split(".").map(Number);
	if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) {
		return false;
	}
	const [a = 0, b = 0] = octets;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127)
	);
}

export function isInternalUrl(url: string): boolean {
	try {
		return isInternalHost(new URL(url).hostname);
	} catch {
		return true;
	}
}
