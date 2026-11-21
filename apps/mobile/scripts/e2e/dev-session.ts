/** The local dev account, for e2e scripts. Refuses non-local URLs. */
const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";

export const apiUrl = requireLocal("EXPO_PUBLIC_API_URL");
export const relayUrl = requireLocal("EXPO_PUBLIC_RELAY_URL");
export const origin = requireLocal("EXPO_PUBLIC_WEB_URL");

function requireLocal(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set; pass --env-file=../../.env`);
	const { hostname } = new URL(value);
	if (hostname !== "localhost" && hostname !== "127.0.0.1") {
		throw new Error(`${name}=${value} is not local; refusing to run`);
	}
	return value.replace(/\/$/, "");
}

export async function signIn(): Promise<{
	cookie: string;
	organizationId: string;
}> {
	const body = JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD });
	const headers = { "content-type": "application/json", origin };
	const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers,
		body,
	});
	if (!response.ok) {
		throw new Error(
			`Dev sign-in failed (${response.status}). Tap "Dev sign in" in the app once so the account exists.`,
		);
	}
	const cookie = response.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ");
	const session = await (
		await fetch(`${apiUrl}/api/auth/get-session`, { headers: { cookie } })
	).json();
	const organizationId = session?.session?.activeOrganizationId;
	if (!organizationId)
		throw new Error("The dev account has no active organization");
	return { cookie, organizationId };
}

export async function mintJwt(cookie: string): Promise<string> {
	const response = await fetch(`${apiUrl}/api/auth/token`, {
		headers: { cookie, origin },
	});
	const { token } = (await response.json()) as { token?: string };
	if (!token) throw new Error("No JWT returned for the dev session");
	return token;
}
