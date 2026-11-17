#!/usr/bin/env node
// The `dev` command inside a box. The box's proxy adds the box's credential; the chat comes from the turn's env.

const api = (process.env.DEV_API_URL ?? "").replace(/\/+$/, "");
const chat = process.env.DEV_GROUP_ID ?? "";

async function call(path: string, body?: unknown): Promise<unknown> {
	const response = await fetch(`${api}${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: { "x-dev-chat": chat, "content-type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const said = (await response.json().catch(() => ({}))) as {
		message?: string;
	};
	if (!response.ok) {
		throw new Error(said.message ?? `The API answered ${response.status}`);
	}
	return said;
}

/** Text given as arguments, or read from stdin when the argument is `-`. */
async function textOf(words: string[]): Promise<string> {
	if (words.length === 1 && words[0] === "-") {
		let input = "";
		for await (const chunk of process.stdin) input += chunk;
		return input.trim();
	}
	return words.join(" ").trim();
}

const flag = (args: string[], name: string) => {
	const at = args.indexOf(name);
	return at >= 0 ? args[at + 1] : undefined;
};

const USAGE = `Usage:
  dev reply "<your reply>"        your answer in the chat (or - to read it from stdin)
  dev update "<a progress note>"  a message mid-turn
  dev chat read [--limit 20]      the chat's recent messages
  dev members                     the people and Devs in the chat
  dev ask <name-or-id> "<question>"  ask another Dev in this chat; its answer comes back to you only`;

const [command, ...rest] = process.argv.slice(2);

try {
	if (command === "reply" || command === "update") {
		const text = await textOf(rest);
		if (!text) throw new Error(USAGE);
		await call(command === "reply" ? "/cli/reply" : "/cli/messages", { text });
		console.log("Sent.");
	} else if (command === "chat" && rest[0] === "read") {
		const limit = flag(rest, "--limit") ?? "20";
		const { messages } = (await call(
			`/cli/messages?limit=${encodeURIComponent(limit)}`,
		)) as {
			messages: { id: string; author: string; text: string; at: string }[];
		};
		for (const message of messages) {
			console.log(
				`${message.at.slice(0, 16).replace("T", " ")} ${message.author} #${message.id.slice(0, 8)}: ${message.text}`,
			);
		}
	} else if (command === "ask" && rest.length >= 2) {
		const [dev, ...words] = rest;
		const { answer } = (await call("/cli/ask", {
			dev,
			question: await textOf(words),
		})) as { answer: string };
		console.log(answer);
	} else if (command === "members") {
		const { people, devs } = (await call("/cli/members")) as {
			people: { name: string; role: string }[];
			devs: { name: string; kind: string }[];
		};
		for (const person of people) console.log(`${person.name} (${person.role})`);
		for (const dev of devs) console.log(`${dev.name} (${dev.kind} Dev)`);
	} else if (command) {
		console.error(
			`\`dev ${[command, ...rest].join(" ")}\` is not available in Paradev yet.\n${USAGE}`,
		);
		process.exit(2);
	} else {
		console.error(USAGE);
		process.exit(2);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
