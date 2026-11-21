import type { CustomerChannelResult } from "../open-customer-channel";

function customerLine(result: CustomerChannelResult): string {
	const invite = result.customerInvite;
	switch (invite.status) {
		case "sent":
			return `:white_check_mark: Slack Connect invite sent to ${invite.email}`;
		case "no_email":
			return ":warning: No billing email on the Stripe customer. Invite the customer by hand.";
		case "failed":
			return `:warning: Slack Connect invite to ${invite.email} failed (\`${invite.error}\`). Invite them by hand.`;
	}
}

function teammateLine(result: CustomerChannelResult): string | null {
	if (result.teammateInviteError) {
		return `:warning: Could not add teammates (\`${result.teammateInviteError}\`).`;
	}
	if (result.teammatesInvited === 0) return null;
	return `:white_check_mark: Added ${result.teammatesInvited} teammate(s)`;
}

export function formatOnboardingReport(
	organizationName: string,
	result: CustomerChannelResult,
): unknown[] {
	const opened = result.created ? "Opened" : "Reused";
	const lines = [
		`:handshake: ${opened} <#${result.channelId}> for *${organizationName}*`,
		teammateLine(result),
		customerLine(result),
	].filter((line): line is string => line !== null);
	return [
		{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
	];
}

export function formatOnboardingFailed(
	organizationName: string,
	channelName: string,
	error: string,
): unknown[] {
	return [
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `:x: Could not open #${channelName} for *${organizationName}* (\`${error}\`). Open it by hand.`,
			},
		},
	];
}
