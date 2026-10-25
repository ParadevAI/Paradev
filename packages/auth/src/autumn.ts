import { Autumn } from "autumn-js";
import { env } from "./env";

export const AUTUMN_API_VERSION = "2.4.0";

export const autumnClient = new Autumn({
	secretKey: env.AUTUMN_SECRET_KEY,
	xApiVersion: AUTUMN_API_VERSION,
	failOpen: false,
});

export const billingUsesAutumn = env.BILLING_PROVIDER === "autumn";

/** Calls Autumn's REST API for what the pinned SDK does not model yet (plan licenses, license pools). */
export async function autumnRest<T>(
	path: string,
	body: unknown,
	timeoutMs = 5_000,
): Promise<T> {
	const response = await fetch(`https://api.useautumn.com/v1/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.AUTUMN_SECRET_KEY}`,
			"Content-Type": "application/json",
			"x-api-version": AUTUMN_API_VERSION,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) {
		throw new Error(`Autumn ${path} failed with ${response.status}`);
	}
	return (await response.json()) as T;
}
