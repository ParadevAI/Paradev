import { type BoxKeys, signBoxToken } from "./box-tokens";
import type { Box, RunnerClient } from "./boxes";

async function post(box: Box, path: string, token: string, body: unknown) {
	const response = await fetch(`${box.url}${path}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) {
		const said = await response.text().catch(() => "");
		throw new Error(
			`the box refused the turn (${response.status} ${said})`.trim(),
		);
	}
}

/**
 * The runner in a box, over HTTP, with a control token for the box and the
 * chat's session. Starting returns once the runner has accepted the turn; the
 * runner calls back when it settles, so no request stays open for a turn.
 */
export function httpRunner(keys: () => Promise<BoxKeys>): RunnerClient {
	const token = async (box: Box, sessionId: string) =>
		signBoxToken(await keys(), { boxId: box.id, scope: "control", sessionId });
	return {
		async start(box, turn) {
			await post(box, "/turns", await token(box, turn.sessionId), {
				sessionId: turn.sessionId,
				text: turn.text,
				meta: {
					env: {},
					turnId: turn.turnId,
					chatId: turn.groupId,
					plugins: [],
					ownerOneToOne: turn.ownerOneToOne,
					devAsk: false,
					canBackground: true,
					...(turn.checkReply ? { checkReply: true } : {}),
					chat: turn.chat,
				},
			});
		},
		async cancel(box, { sessionId }) {
			await post(box, "/turns/cancel", await token(box, sessionId), {
				sessionId,
			});
		},
	};
}
