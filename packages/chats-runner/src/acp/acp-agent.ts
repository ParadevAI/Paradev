import * as acp from "@agentclientprotocol/sdk";
import type { Grant } from "../auth/auth.ts";
import type { Hub } from "../hub/hub.ts";

/** JSON-RPC code for "you may not do that" (application-defined range), so clients can tell it from bad params. */
const FORBIDDEN = -32003;

/**
 * Serves one ACP connection, for watching: sessions are groups and already exist conceptually, so clients
 * `session/load` the one session their token names (no `session/new`) and receive the replay and live updates. Every
 * update goes to every connection attached to the session. Turns are started and cancelled over HTTP (turn-http).
 */
export function serveAcp(stream: acp.Stream, opts: { grant: Grant; hub: Hub }) {
	const { grant, hub } = opts;
	let detach: (() => void) | null = null;

	const connection = acp
		.agent({ name: "dev-runner" })
		.onRequest("initialize", () => ({
			protocolVersion: acp.PROTOCOL_VERSION,
			agentCapabilities: { loadSession: true },
			agentInfo: { name: "dev-runner", version: "0.1.0" },
		}))
		.onRequest("session/new", () => {
			throw acp.RequestError.invalidRequest(
				undefined,
				"sessions are groups: use session/load with the group id",
			);
		})
		.onRequest("session/load", async ({ params, client }) => {
			if (params.sessionId !== grant.sessionId)
				throw new acp.RequestError(
					FORBIDDEN,
					"this token is for another session",
				);
			const session = await hub.get(params.sessionId);
			detach?.();
			const attached = session.attach(
				(update) =>
					void client.notify("session/update", {
						sessionId: params.sessionId,
						update,
					}),
			);
			// Queued before any live update the listener sends, so the client sees history in order.
			for (const update of attached.replay)
				void client.notify("session/update", {
					sessionId: params.sessionId,
					update,
				});
			detach = attached.detach;
			return {};
		})
		.connect(stream);

	void connection.closed.then(() => detach?.());
	return connection;
}
