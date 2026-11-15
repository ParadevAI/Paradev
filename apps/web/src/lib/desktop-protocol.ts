import { PROTOCOL_SCHEMES } from "@superset/shared/constants";

/**
 * The desktop registers `superset` (release), `superset-dev`, or
 * `superset-<workspace>` for a dev instance. Pages paste the scheme straight
 * into a deep link (the sign-in success page adds a session token), so
 * anything else would send the user, or the token, to an attacker's URL.
 * Mirrors the allowlist in apps/api `auth/desktop/connect`.
 */
const DESKTOP_PROTOCOL = new RegExp(
	`^${PROTOCOL_SCHEMES.PROD}(?:-[a-z0-9][a-z0-9-]*)?$`,
	"i",
);

export function isDesktopProtocol(protocol: string): boolean {
	return DESKTOP_PROTOCOL.test(protocol);
}

export function desktopCheckoutReturnUrl(
	protocol: string | undefined,
): string | null {
	if (!protocol || !isDesktopProtocol(protocol)) return null;
	return `${protocol}://settings/billing?checkout=success`;
}
