import { PostHog, type PostHogOptions } from "posthog-node";
import { WAITLIST_PLATFORM } from "../../constants";

interface CaptureWaitlistSignupOptions {
	apiKey: string;
	host: string;
	fetch?: PostHogOptions["fetch"];
	fetchRetryCount?: number;
}

/** Sends `waitlist_signup` under a new random id, so the address is not linked to any browser identity. */
export async function captureWaitlistSignup(
	email: string,
	{ apiKey, host, fetch, fetchRetryCount = 1 }: CaptureWaitlistSignupOptions,
): Promise<void> {
	const client = new PostHog(apiKey, {
		host,
		fetch,
		fetchRetryCount,
		fetchRetryDelay: 500,
		requestTimeout: 3000,
		disableCompression: true,
	});
	let failure: unknown;
	client.on("error", (error) => {
		failure = error;
	});
	await client.captureImmediate({
		distinctId: crypto.randomUUID(),
		event: "waitlist_signup",
		properties: {
			email,
			platform: WAITLIST_PLATFORM,
			$process_person_profile: false,
		},
	});
	if (failure) throw failure;
}
