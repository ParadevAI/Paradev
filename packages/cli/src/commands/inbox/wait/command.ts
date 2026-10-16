import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { agentSessionId } from "../session";

const FIRST_POLL_MS = 2_000;
const MAX_POLL_MS = 15_000;
const MAX_WAIT_SECONDS = 24 * 60 * 60;

function parseTimeout(value: string): number {
	const match = /^(\d+)\s*([smh]?)$/i.exec(value.trim());
	if (!match) {
		throw new CLIError(
			`--timeout: "${value}" is not a duration`,
			"Use a number with s, m or h, e.g. 30m or 8h",
		);
	}
	const n = Number(match[1]);
	const unit = (match[2] || "s").toLowerCase();
	const seconds = unit === "h" ? n * 3600 : unit === "m" ? n * 60 : n;
	if (seconds < 1 || seconds > MAX_WAIT_SECONDS) {
		throw new CLIError(
			`--timeout: "${value}" is outside 1s to 24h`,
			"Wait again after it returns if the agent should keep waiting",
		);
	}
	return seconds;
}

export default command({
	description:
		"Block until a card is answered, then print the outcome as JSON. The timeout is the agent's own patience, not a deadline for the person",
	args: [positional("card").required().desc("Card id")],
	options: {
		timeout: string()
			.default("8h")
			.desc("How long to wait before giving up, e.g. 30m or 8h (default 8h)"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.card as string;
		const timeoutSeconds = parseTimeout(options.timeout);
		const sessionId = agentSessionId();

		const begun = await ctx.api.inbox.beginWait.mutate({
			id,
			agentSessionId: sessionId,
			timeoutSeconds,
		});
		if (begun.card.resolvedAt) {
			return {
				data: { outcome: begun.card.outcome, card: begun.card },
				message: JSON.stringify(begun.card.outcome ?? {}),
			};
		}

		const deadline = Date.now() + timeoutSeconds * 1000;
		let delay = FIRST_POLL_MS;
		try {
			while (Date.now() < deadline) {
				await new Promise((r) => setTimeout(r, delay));
				delay = Math.min(MAX_POLL_MS, Math.round(delay * 1.5));
				const card = await ctx.api.inbox.get.query({ id });
				if (card.resolvedAt) {
					return {
						data: { outcome: card.outcome, card },
						message: JSON.stringify(card.outcome ?? {}),
					};
				}
			}
		} finally {
			if (begun.waitId) {
				await ctx.api.inbox.endWait
					.mutate({ waitId: begun.waitId })
					.catch(() => {});
			}
		}
		throw new CLIError(
			`No answer within ${options.timeout}`,
			"The card is still open. Wait again, or resolve it yourself with `superset inbox resolve`",
		);
	},
});
