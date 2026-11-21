import { quoteShellToken } from "renderer/lib/argv";

/** ssh reads a leading dash as an option, not a destination. */
export function isValidSshTarget(target: string): boolean {
	return /^[^\s-][^\s]*$/.test(target);
}

/**
 * The shell command the dialog runs. SUPERSET_ORGANIZATION_ID lets the
 * bundled CLI act as the app's account through the local host, the same
 * way it does in a workspace terminal; without a local host it signs in.
 */
export function buildHostsAddCommand(
	target: string,
	organizationId: string,
): string {
	const org = quoteShellToken(organizationId);
	return [
		`export SUPERSET_ORGANIZATION_ID=${org}`,
		`superset auth whoami >/dev/null 2>&1 || superset auth login --organization ${org} || exit 1`,
		`superset hosts add --org ${org} ${quoteShellToken(target)}`,
	].join("; ");
}
