import type { ApiClient } from "../api-client";

export async function revokeKeysNamed(
	api: ApiClient,
	name: string,
): Promise<number> {
	const keys = await api.apiKey.list.query();
	const matching = keys.filter((key) => key.name === name);
	for (const key of matching) await api.apiKey.revoke.mutate({ id: key.id });
	return matching.length;
}

/** The API key a host set up over SSH signs in with; `hosts remove` finds it by this name. */
export function hostKeyName(hostname: string, hostId: string): string {
	const shortName = hostname.split(".")[0] || hostname;
	// better-auth rejects API key names longer than 32 characters.
	return `Host ${hostId.slice(0, 8)} ${shortName}`.slice(0, 32);
}
