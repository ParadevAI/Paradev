/**
 * Sends a direct message to an agent through the API and prints the session's
 * live stream until the turn ends.
 *
 *   bun run send -- <agentId> "<text>" [--interrupt-after <seconds>]
 *
 * Needs AGENT_API_URL and SUPERSET_API_KEY (an API key for the person sending).
 */
import { randomUUID } from "node:crypto";
import SuperJSON from "superjson";

const [agentId, text, ...rest] = process.argv.slice(2);
if (!agentId || !text) {
	console.error(
		'usage: bun run send -- <agentId> "<text>" [--interrupt-after <s>]',
	);
	process.exit(2);
}
const interruptFlag = rest.indexOf("--interrupt-after");
const interruptAfterS =
	interruptFlag >= 0 ? Number(rest[interruptFlag + 1]) : null;

const apiUrl = process.env.AGENT_API_URL;
const apiKey = process.env.SUPERSET_API_KEY;
if (!apiUrl || !apiKey) {
	console.error("Set AGENT_API_URL and SUPERSET_API_KEY");
	process.exit(2);
}

async function mutate<T>(procedure: string, input: unknown): Promise<T> {
	const response = await fetch(`${apiUrl}/api/trpc/${procedure}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": apiKey as string,
		},
		body: JSON.stringify(SuperJSON.serialize(input)),
	});
	const body = await response.text();
	if (!response.ok) throw new Error(`${procedure} ${response.status}: ${body}`);
	return SuperJSON.deserialize<T>(JSON.parse(body).result.data);
}

const dm = await mutate<{ sessionId: string; channelId: string }>(
	"agent.openDirectMessage",
	{ agentId },
);
const turn = await mutate<{
	sessionId: string;
	turnId: string;
	outcome: string;
}>("agent.promptSession", {
	sessionId: dm.sessionId,
	promptId: randomUUID(),
	text,
});
console.log(`turn ${turn.turnId} ${turn.outcome} in session ${turn.sessionId}`);

const stream = await mutate<{ url: string; ticket: string }>(
	"agent.sessionStream",
	{
		sessionId: turn.sessionId,
	},
);
const url = new URL(stream.url.replace(/^http/, "ws"));
url.searchParams.set("ticket", stream.ticket);
url.searchParams.set("deltas", "text");

if (interruptAfterS !== null) {
	setTimeout(() => {
		console.log("-- interrupting");
		void mutate("agent.interruptTurn", { sessionId: turn.sessionId });
	}, interruptAfterS * 1000);
}

const socket = new WebSocket(url);
let seenOurTurn = false;
socket.addEventListener("message", (message) => {
	const frame = JSON.parse(String(message.data));
	if (frame.delta) {
		process.stdout.write(frame.delta.append ?? "");
		return;
	}
	const event = frame.event;
	if (!event) {
		console.log(JSON.stringify(frame).slice(0, 300));
		return;
	}
	if (event.type === "turn") {
		if (event.turn.id === turn.turnId) seenOurTurn = true;
		console.log(`\n[turn ${event.turn.id} ${event.turn.status}]`);
		if (event.turn.id === turn.turnId && event.turn.status !== "running") {
			socket.close();
		}
		return;
	}
	if (event.type === "item" && seenOurTurn) {
		const { item } = event;
		const label = item.kind ?? item.type;
		const detail = item.title ?? item.status ?? "";
		console.log(`\n[${label}${detail ? ` ${detail}` : ""}]`);
	}
});
socket.addEventListener("close", (event) => {
	console.log(`stream closed ${event.code}`);
	process.exit(0);
});
