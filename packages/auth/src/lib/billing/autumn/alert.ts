import { env } from "../../../env";

export async function alertBilling(text: string, error?: unknown) {
	console.error(`[billing] ${text}`, error ?? "");
	try {
		const response = await fetch(env.SLACK_BILLING_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: `:rotating_light: ${text}` }),
		});
		if (!response.ok) {
			console.error("[billing] Slack alert failed", response.status);
		}
	} catch (slackError) {
		console.error("[billing] Slack alert failed", slackError);
	}
}
