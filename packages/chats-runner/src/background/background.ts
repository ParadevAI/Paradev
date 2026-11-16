import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

type TaskKind = "agent" | "shell" | "monitor";
type TaskStatus = "running" | "completed" | "failed" | "stopped" | "lost";

/** One piece of background work, as the box keeps it: who it belongs to and how it stands. */
interface TaskRecord {
	id: string;
	/** What the Dev called it (an agent's `name`), to reach it by. */
	name?: string;
	kind: TaskKind;
	/** The chat whose session started it, where its notice goes. */
	chatId: string;
	/** Its few words: "compare flights to Goa". */
	description: string;
	status: TaskStatus;
	startedAt: string;
	endedAt?: string;
	/** Its notice went out (each goes once). */
	notified: boolean;
}

/** How background work ended (or, for a monitor, what it saw), for its notice. */
interface TaskEnd {
	status: Exclude<TaskStatus, "running"> | "event";
	/** One line: `Agent "compare flights" finished`. */
	summary: string;
	result?: string;
	usage?: string;
	/** Where its full output is (a command's log), for the Dev to read when it needs more. */
	outputFile?: string;
}

const esc = (text: string) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * The notice the Dev reads when background work ends, in Claude Code's shape: an envelope it can't mistake for
 * someone in the chat, then the task's id, kind and status, a one-line summary, and its result.
 */
function noticeText(
	task: Pick<TaskRecord, "id" | "kind">,
	end: TaskEnd,
): string {
	const tag = (name: string, value: string | undefined) =>
		value ? `<${name}>${esc(value)}</${name}>` : null;
	return [
		"[Background notice: work you started ended. This is the system, not a message from anyone in the chat.]",
		"<task-notification>",
		tag("task-id", task.id),
		tag("task-type", task.kind),
		tag("status", end.status),
		tag("summary", end.summary),
		tag("output-file", end.outputFile),
		tag("result", end.result),
		tag("usage", end.usage),
		"</task-notification>",
	]
		.filter(Boolean)
		.join("\n");
}

/** Hands a notice to the chat: into its running turn when there is one, else as a turn of its own (the API's). */
export type DeliverNotice = (chatId: string, text: string) => Promise<void>;

/** Stops running work, in this process: what the Dev reads back (an agent's partial result), if anything. */
type Stop = () => string | undefined;

export interface BackgroundHost {
	/** Records work that starts now; `stop` is how `task_stop` (or a deleted chat) stops it. */
	start(
		record: Omit<TaskRecord, "status" | "startedAt" | "notified">,
		stop: Stop,
	): TaskRecord;
	/** Work that ended runs again (an agent given its next message): it will notify again when it ends. */
	restart(id: string, stop: Stop): void;
	/** Stops running work by id; undefined when it isn't running in this box. */
	stop(id: string): { said: string | undefined } | undefined;
	/** Stops a chat's running work, quietly: the chat is gone. */
	stopChat(chatId: string): void;
	/** A monitor saw something: a notice to its chat, without ending it. */
	event(id: string, summary: string, lines: string): Promise<void>;
	/** Records how it ended and sends its notice, once; `quiet` (the Dev stopped it itself) sends none. */
	end(id: string, end: TaskEnd, opts?: { quiet?: boolean }): Promise<void>;
	get(id: string): TaskRecord | undefined;
	/** A chat's work, newest first. */
	inChat(chatId: string): TaskRecord[];
	/** Forgets a chat's finished work beyond its newest `keep`, returning what went (so its files can go too). */
	prune(chatId: string, keep: number): TaskRecord[];
	/** Whether anything runs: the API keeps the box up meanwhile. */
	busy(): boolean;
	/** How many of a kind run, across the box's chats. */
	running(kind: TaskKind): number;
}

/**
 * The box's background work, as Claude Code keeps its tasks: in the process, with a small record in the Dev's folder
 * (`.dev/background.json`) so a box that wakes after the last one went away can tell each chat what didn't finish,
 * as Claude Code does on its next start. Work still `running` in the record when the box starts was lost with the old
 * box; its notice goes out now.
 */
export function createBackgroundHost(opts: {
	agentDir: string;
	deliver: DeliverNotice;
}): BackgroundHost & { ready: Promise<void> } {
	const file = join(opts.agentDir, ".dev", "background.json");
	const records = new Map<string, TaskRecord>();
	const stops = new Map<string, Stop>();
	if (existsSync(file)) {
		try {
			for (const r of JSON.parse(readFileSync(file, "utf8")) as TaskRecord[])
				records.set(r.id, r);
		} catch (err) {
			console.error(
				"dev-runner: couldn't read the background record, starting afresh:",
				err,
			);
		}
	}

	function save() {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(`${file}.tmp`, JSON.stringify([...records.values()]));
		renameSync(`${file}.tmp`, file);
	}

	async function end(
		id: string,
		how: TaskEnd,
		endOpts: { quiet?: boolean } = {},
	) {
		const record = records.get(id);
		if (!record || record.status !== "running" || how.status === "event")
			return;
		stops.delete(id);
		Object.assign(record, {
			status: how.status,
			endedAt: new Date().toISOString(),
		});
		const send = !record.notified && !endOpts.quiet;
		record.notified = true;
		save();
		if (!send) return;
		await opts
			.deliver(record.chatId, noticeText(record, how))
			.catch((err: unknown) =>
				console.error(`dev-runner: couldn't deliver the notice of ${id}:`, err),
			);
	}

	const lost = [...records.values()].filter((r) => r.status === "running");
	const ready = Promise.all(
		lost.map((r) =>
			end(r.id, {
				status: "lost",
				summary: `${r.kind === "agent" ? "Agent" : r.kind === "shell" ? "Command" : "Monitor"} "${r.description}" didn't finish: the box it ran in stopped`,
				result:
					r.kind === "agent"
						? `What it did is kept: \`send_message\` to ${r.name ?? r.id} picks it up again.`
						: undefined,
			}),
		),
	).then(() => {});

	return {
		ready,
		start(record, stop) {
			const full: TaskRecord = {
				...record,
				status: "running",
				startedAt: new Date().toISOString(),
				notified: false,
			};
			records.set(full.id, full);
			stops.set(full.id, stop);
			save();
			return full;
		},
		restart(id, stop) {
			const record = records.get(id);
			if (!record) return;
			Object.assign(record, {
				status: "running",
				notified: false,
				endedAt: undefined,
			});
			stops.set(id, stop);
			save();
		},
		stop(id) {
			const stop = stops.get(id);
			return stop ? { said: stop() } : undefined;
		},
		stopChat(chatId) {
			for (const [id, stop] of stops)
				if (records.get(id)?.chatId === chatId) stop();
		},
		async event(id, summary, lines) {
			const record = records.get(id);
			if (!record || record.status !== "running") return;
			await opts
				.deliver(
					record.chatId,
					noticeText(record, { status: "event", summary, result: lines }),
				)
				.catch((err: unknown) =>
					console.error(`dev-runner: couldn't deliver an event of ${id}:`, err),
				);
		},
		end,
		get: (id) => records.get(id),
		inChat: (chatId) =>
			[...records.values()]
				.filter((r) => r.chatId === chatId)
				.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
		prune(chatId, keep) {
			const done = [...records.values()]
				.filter((r) => r.chatId === chatId && r.status !== "running")
				.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
			const gone = done.slice(keep);
			for (const r of gone) records.delete(r.id);
			if (gone.length) save();
			return gone;
		},
		busy: () => [...records.values()].some((r) => r.status === "running"),
		running: (kind) =>
			[...records.values()].filter(
				(r) => r.kind === kind && r.status === "running",
			).length,
	};
}
