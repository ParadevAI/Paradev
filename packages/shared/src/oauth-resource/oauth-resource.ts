import { CANONICAL_URLS } from "../app-identity";
import { isOwnOriginTwin } from "../own-domains";

/**
 * The `resource` to send with an OAuth authorize, code or refresh request.
 * Every production API host issues tokens for `CANONICAL_URLS.API` and
 * refuses any other resource, so its twins send that value.
 */
export function oauthResource(apiUrl: string): string {
	return isOwnOriginTwin(new URL(apiUrl).origin, CANONICAL_URLS.API)
		? CANONICAL_URLS.API
		: apiUrl;
}
