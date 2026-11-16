#!/usr/bin/env node
// The `dev` command inside a box. The box's proxy adds the box's credential; the chat comes from the turn's env.

const api = (process.env.DEV_API_URL ?? "").replace(/\/+$/, "");
const chat = process.env.DEV_GROUP_ID ?? "";

async function post(path: string, body: unknown): Promise<void> {
	const response = await fetch(`${api}${path}`, {
		method: "POST",
		headers: { "x-dev-chat": chat, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (response.ok) return;
	const said = (await response.json().catch(() => ({}))) as {
		message?: string;
	};
	throw new Error(said.message ?? `The API answered ${response.status}`);
}

const [command, ...rest] = process.argv.slice(2);
const text = rest.join(" ").trim();

try {
	if (command === "reply" && text) {
		await post("/cli/reply", { text });
		console.log("Sent.");
	} else if (command === "update" && text) {
		await post("/cli/messages", { text });
		console.log("Sent.");
	} else {
		console.error(
			'Usage: dev reply "<your reply>" | dev update "<a progress note>"',
		);
		process.exit(2);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
