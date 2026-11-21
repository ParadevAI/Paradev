/**
 * A host for the local relay that needs no second machine. `register` makes it
 * exist, `online` holds the relay control socket open, and that socket is all
 * presence looks at, so no tunnel protocol is spoken.
 *
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts register --id e2e-mini --name "Mac mini"
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts online --id e2e-mini --seconds 60
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts presence --id e2e-mini
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts delete --id e2e-mini
 */
import { parseArgs } from "node:util";
import { apiUrl, mintJwt, origin, relayUrl, signIn } from "./dev-session";

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		id: { type: "string" },
		name: { type: "string", default: "Stand-in host" },
		seconds: { type: "string", default: "60" },
	},
});
const [command] = positionals;
if (!command || !values.id) {
	throw new Error(
		"usage: stand-in-host.ts <register|online|presence|delete> --id <machineId>",
	);
}
const machineId = values.id;

async function trpcMutation(
	path: string,
	input: unknown,
	headers: Record<string, string>,
): Promise<unknown> {
	const response = await fetch(`${apiUrl}/api/trpc/${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", origin, ...headers },
		body: JSON.stringify({ json: input }),
	});
	const payload = await response.json();
	if (!response.ok) throw new Error(`${path}: ${JSON.stringify(payload)}`);
	return payload;
}

const { cookie, organizationId } = await signIn();
const routingKey = `${organizationId}:${machineId}`;

if (command === "register") {
	const jwt = await mintJwt(cookie);
	await trpcMutation(
		"host.ensure",
		{
			organizationId,
			machineId,
			name: values.name,
			version: "0.0.0-e2e",
			platform: "darwin",
		},
		{ authorization: `Bearer ${jwt}` },
	);
	console.log(`registered ${routingKey}`);
} else if (command === "delete") {
	await trpcMutation("host.delete", { hostId: machineId }, { cookie });
	console.log(`deleted ${routingKey}`);
} else if (command === "presence") {
	const jwt = await mintJwt(cookie);
	const response = await fetch(
		`${relayUrl}/presence?hostIds=${encodeURIComponent(routingKey)}`,
		{ headers: { authorization: `Bearer ${jwt}` } },
	);
	console.log(JSON.stringify((await response.json()).hosts?.[routingKey]));
} else if (command === "online") {
	const jwt = await mintJwt(cookie);
	const socket = new WebSocket(
		`${relayUrl.replace(/^http/, "ws")}/v2/control?hostId=${encodeURIComponent(routingKey)}`,
		// Bun's WebSocket takes headers; the DOM type does not know that.
		{ headers: { authorization: `Bearer ${jwt}` } } as unknown as string[],
	);
	socket.onopen = () => console.log(`online ${routingKey}`);
	socket.onclose = (event) => {
		console.log(`offline ${routingKey} (${event.code} ${event.reason})`);
		process.exit(event.code === 1000 ? 0 : 1);
	};
	setTimeout(() => socket.close(1000, "done"), Number(values.seconds) * 1000);
} else {
	throw new Error(`unknown command: ${command}`);
}
