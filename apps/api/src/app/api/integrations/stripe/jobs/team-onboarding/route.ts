import { WebClient } from "@slack/web-api";
import { z } from "zod";

import { env } from "@/env";
import { verifyQstashRequest } from "@/lib/verifyQstash";

import { customerChannelName } from "../utils/customer-channel-name";
import {
	formatOnboardingFailed,
	formatOnboardingReport,
} from "./format-onboarding-report";
import { openCustomerChannel } from "./open-customer-channel";

const TEAM_ONBOARDING_PATH = "/api/integrations/stripe/jobs/team-onboarding";

const payloadSchema = z.object({
	stripeSubscriptionId: z.string(),
	stripeCustomerId: z.string(),
	organizationName: z.string(),
	customerEmail: z.string().email().nullable(),
});

function welcomeText(organizationName: string): string {
	return [
		`Welcome to Paradev, ${organizationName}! :wave:`,
		"This is a shared channel with the Paradev team. Ask us anything here: setup, workflows, bugs or feedback. We read every message.",
	].join("\n");
}

async function postToBilling(blocks: unknown[]): Promise<void> {
	const response = await fetch(env.SLACK_BILLING_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ blocks }),
	});
	if (!response.ok) {
		console.error(
			"[stripe/team-onboarding] Slack webhook failed:",
			response.status,
			await response.text(),
		);
	}
}

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		TEAM_ONBOARDING_PATH,
	);
	if (rejected) return rejected;

	const token = env.SLACK_CUSTOMER_CHANNELS_BOT_TOKEN;
	if (!token) return Response.json({ skipped: "no bot token" });

	let rawPayload: unknown;
	try {
		rawPayload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}
	const parsed = payloadSchema.safeParse(rawPayload);
	if (!parsed.success) {
		console.error("[stripe/team-onboarding] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const payload = parsed.data;
	const name = customerChannelName(
		payload.organizationName,
		payload.stripeCustomerId,
	);

	try {
		const result = await openCustomerChannel({
			client: new WebClient(token),
			name,
			teammateIds: env.SLACK_CUSTOMER_CHANNEL_TEAMMATE_IDS,
			customerEmail: payload.customerEmail,
			welcomeText: welcomeText(payload.organizationName),
		});
		await postToBilling(
			formatOnboardingReport(payload.organizationName, result),
		);
		return Response.json({ success: true, channelId: result.channelId });
	} catch (error) {
		console.error(
			`[stripe/team-onboarding] Could not open #${name} for ${payload.stripeSubscriptionId}:`,
			error,
		);
		const code =
			(error as { data?: { error?: string } }).data?.error ??
			(error instanceof Error ? error.message : "unknown_error");
		await postToBilling(
			formatOnboardingFailed(payload.organizationName, name, code),
		);
		return Response.json({ success: false, error: code });
	}
}
