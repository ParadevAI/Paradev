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

interface CliTask {
	id: string;
	title: string;
	description: string;
	status: "todo" | "in_progress" | "done";
	due: string | null;
	scheduledAt: string | null;
	remind: boolean;
	assignee: string | null;
}

const TASK_MARK = { todo: "[ ]", in_progress: "[~]", done: "[x]" };

function formatTask(task: CliTask): string {
	const details = [
		...(task.due ? [`due ${task.due}`] : []),
		...(task.scheduledAt
			? [
					`${task.remind ? "remind" : "at"} ${task.scheduledAt.slice(0, 16).replace("T", " ")} UTC`,
				]
			: []),
		...(task.assignee ? [`@${task.assignee}`] : []),
	];
	return `${task.id}  ${TASK_MARK[task.status]} ${task.title}${details.length ? ` (${details.join(", ")})` : ""}`;
}

/** The flags of `dev task add` and `dev task update`, as the API takes them. */
function taskFields(args: string[]) {
	const text = (name: string) => flag(args, name);
	return {
		...(text("--title") ? { title: text("--title") } : {}),
		...(text("--description") !== undefined
			? { description: text("--description") }
			: {}),
		...(text("--status") ? { status: text("--status") } : {}),
		...(text("--assignee") ? { assignee: text("--assignee") } : {}),
		...(text("--due") ? { due: text("--due") } : {}),
		...(text("--repeat") ? { repeat: text("--repeat") } : {}),
		...(args.includes("--remind") ? { remind: true } : {}),
	};
}

/** The words before the first flag. */
const leading = (args: string[]) => {
	const end = args.findIndex((arg) => arg.startsWith("--"));
	return (end < 0 ? args : args.slice(0, end)).join(" ").trim();
};

async function taskCommand([action, ...args]: string[]) {
	const id = args[0];
	if (action === "add") {
		const title = leading(args);
		if (!title) throw new Error(USAGE);
		const { task } = (await call("/cli/tasks", {
			...taskFields(args),
			title,
		})) as { task: CliTask };
		console.log(`Added ${formatTask(task)}`);
	} else if (action === "list") {
		const query = new URLSearchParams();
		for (const name of ["assignee", "status", "search", "limit", "offset"]) {
			const value = flag(args, `--${name}`);
			if (value) query.set(name, value);
		}
		const { tasks, total, nextOffset } = (await call(
			`/cli/tasks?${query}`,
		)) as { tasks: CliTask[]; total: number; nextOffset: number | null };
		for (const task of tasks) console.log(formatTask(task));
		if (tasks.length === 0) console.log("No tasks.");
		if (nextOffset !== null) {
			console.log(
				`${nextOffset - tasks.length + 1}–${nextOffset} of ${total}. More: add --offset ${nextOffset}`,
			);
		}
	} else if (action === "show" && id) {
		const { task, activity } = (await call(`/cli/tasks/${id}`)) as {
			task: CliTask;
			activity: { kind: string; text: string; at: string }[];
		};
		console.log(formatTask(task));
		if (task.description) console.log(`\n${task.description}`);
		if (activity.length) console.log("\nActivity:");
		for (const entry of activity) {
			console.log(
				`[${entry.at.slice(0, 16).replace("T", " ")}] ${entry.kind}${entry.text ? `: ${entry.text}` : ""}`,
			);
		}
	} else if (action === "update" && id) {
		const { task } = (await call(
			`/cli/tasks/${id}/update`,
			taskFields(args.slice(1)),
		)) as { task: CliTask };
		console.log(`Updated ${formatTask(task)}`);
	} else if (
		(action === "start" || action === "done" || action === "reopen") &&
		id
	) {
		const { task } = (await call(`/cli/tasks/${id}/${action}`, {})) as {
			task: CliTask;
		};
		const said = { start: "Started", done: "Done", reopen: "Reopened" };
		console.log(`${said[action]} ${formatTask(task)}`);
	} else if (action === "comment" && id) {
		const text = await textOf(args.slice(1));
		if (!text) throw new Error(USAGE);
		await call(`/cli/tasks/${id}/comments`, { text });
		console.log("Logged.");
	} else if (action === "delete" && id) {
		await call(`/cli/tasks/${id}/delete`, {});
		console.log("Deleted.");
	} else {
		throw new Error(USAGE);
	}
}

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
  dev file get <id>               save one of them to your folder and print its path
  dev task add "<title>" [--description "<markdown>"] [--assignee <name|me>] [--due "<when>"] [--remind]
  dev task list [--assignee me|<name>|none] [--status todo|in_progress|done|open] [--search "<words>"] [--limit 25] [--offset 0]
  dev task show <id>              a task with its description and activity
  dev task update <id> [--title] [--description] [--status todo|in_progress|done] [--assignee <name|me|none>] [--due "<when>"|none] [--remind]
  dev task start|done|reopen <id>
  dev task comment <id> "<note>"  a note on the task
  dev task delete <id>`;

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
	} else if (command === "task") {
		await taskCommand(rest);
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
