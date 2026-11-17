#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

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

const FILE_TYPES: Record<string, string> = {
	".pdf": "application/pdf",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".csv": "text/csv",
	".md": "text/markdown",
	".txt": "text/plain",
	".json": "application/json",
	".html": "text/html",
	".zip": "application/zip",
};

/** Where `dev file get` saves a chat's files. */
const FILES_DIR = join(process.env.DEV_AGENT_DIR ?? "/agent", "files");

async function raw(path: string, init?: RequestInit): Promise<Response> {
	const response = await fetch(`${api}${path}`, {
		...init,
		headers: { "x-dev-chat": chat, ...init?.headers },
	});
	if (!response.ok) {
		const said = (await response.json().catch(() => ({}))) as {
			message?: string;
		};
		throw new Error(said.message ?? `The API answered ${response.status}`);
	}
	return response;
}

const USAGE = `Usage:
  dev reply "<your reply>"        your answer in the chat (or - to read it from stdin)
  dev update "<a progress note>"  a message mid-turn
  dev chat read [--limit 20]      the chat's recent messages
  dev members                     the people and Devs in the chat
  dev ask <name-or-id> "<question>"  ask another Dev in this chat; its answer comes back to you only
  dev file share <path> [--message "<text>"]  post a file from your folder in the chat (up to 25 MB)
  dev file list                   the files shared in the chat, with their ids
  dev file get <id>               save one of them to your folder and print its path`;

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
	} else if (command === "file" && rest[0] === "share" && rest[1]) {
		const path = rest[1];
		const query = new URLSearchParams({
			name: basename(path),
			type:
				FILE_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
			message: flag(rest, "--message") ?? "",
		});
		await raw(`/cli/files?${query}`, {
			method: "POST",
			headers: { "content-type": "application/octet-stream" },
			body: readFileSync(path),
		});
		console.log("Shared.");
	} else if (command === "file" && rest[0] === "list") {
		const { files } = (await call("/cli/files")) as {
			files: {
				id: string;
				name: string;
				contentType: string;
				sizeBytes: number;
				from: string;
				at: string;
			}[];
		};
		for (const file of files) {
			console.log(
				`${file.id} ${file.name} (${file.contentType}, ${file.sizeBytes} bytes) from ${file.from}, ${file.at.slice(0, 16).replace("T", " ")}`,
			);
		}
		if (files.length === 0) console.log("No files in this chat.");
	} else if (command === "file" && rest[0] === "get" && rest[1]) {
		const response = await raw(`/cli/files/${rest[1]}/content`);
		const name = basename(
			decodeURIComponent(response.headers.get("x-dev-file-name") ?? rest[1]),
		);
		mkdirSync(FILES_DIR, { recursive: true });
		const saved = join(FILES_DIR, name);
		writeFileSync(saved, new Uint8Array(await response.arrayBuffer()));
		console.log(saved);
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
