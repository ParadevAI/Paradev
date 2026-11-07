import { CLIError } from "@superset/cli-framework";
import { getApiUrl } from "./config";

const minted = new Map<string, Promise<string>>();

/**
 * The relay and the Workers verify a user JWT; an `sk_live_` API key is traded
 * for one at the API, once per run. Any other credential is returned as is.
 */
export function jwtForApiKey(
	bearer: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	if (!bearer.startsWith("sk_live_")) return Promise.resolve(bearer);
	let jwt = minted.get(bearer);
	if (!jwt) {
		jwt = mint(bearer, fetchImpl);
		minted.set(bearer, jwt);
		jwt.catch(() => minted.delete(bearer));
	}
	return jwt;
}

async function mint(apiKey: string, fetchImpl: typeof fetch): Promise<string> {
	const response = await fetchImpl(`${getApiUrl()}/api/auth/token`, {
		headers: { "x-api-key": apiKey },
	});
	if (!response.ok) {
		throw new CLIError(
			`Could not get a token for this API key (${response.status})`,
			"Check the key with: superset auth whoami",
		);
	}
	return ((await response.json()) as { token: string }).token;
}
