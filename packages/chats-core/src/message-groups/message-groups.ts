import type { Message, TriggerBatch } from "../model/model.ts";
import { toDateString } from "../task-command/task-command.ts";

/** Consecutive messages from one author within this window stack as one run of bubbles, as in iMessage. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** A conversation that resumes after this long gets a time line, as iMessage does after an hour. */
const TIME_GAP_MS = 60 * 60 * 1000;

export type ThreadItem =
	/** A day's first line; `at` is the ISO time of what opens the day, shown beside it. */
	| { kind: "day"; key: string; date: string; at: string }
	/** The conversation resuming after an hour or more on the same day; `at` is the ISO time of the message after it. */
	| { kind: "time"; key: string; at: string }
	/**
	 * `first`: opens a run of one author's bubbles (the name goes above it); `last`: ends it (the avatar and the tail go
	 * beside it). A lone message is both. A task's card is a `slim` line. `tasks`: the task cards a Dev made in the
	 * turn that wrote this message, oldest first, folded under it rather than shown on their own (see `turnTasks`).
	 */
	| {
			kind: "message";
			key: string;
			message: Message;
			first: boolean;
			last: boolean;
			slim?: true;
			tasks?: Message[];
	  }
	/**
	 * Trigger batches between two messages, folded into one "N events handled" line; `from`/`to` are ISO times.
	 * `handling`: how many of `count` are in batches the Dev is still on.
	 */
	| {
			kind: "events";
			key: string;
			count: number;
			handling: number;
			toolkits: string[];
			from: string;
			to: string;
			batchIds: string[];
	  }
	/**
	 * A voice call, folded into one "Voice call · 2:16" line that opens to what was said on it (`messages`, oldest first):
	 * at its record (`at`, when it ended), or, still going (`durationMs` null), at the end of the thread.
	 */
	| {
			kind: "call";
			key: string;
			at: string;
			startedAt: string;
			durationMs: number | null;
			messages: Message[];
	  };

/** The row key of the call going on now; its record, once posted, takes its own. */
const LIVE_CALL_KEY = "call-live";

/** Each call's span in the thread: its record's (start to end) and the live call's (start, open-ended). */
function callWindows(messages: Message[], live?: { startedAt: string }) {
	const windows = messages.flatMap((m) =>
		m.call
			? [
					{
						key: `call-${rowKey(m)}`,
						from: m.call.startedAt,
						to: m.at as string | null,
					},
				]
			: [],
	);
	return live
		? [...windows, { key: LIVE_CALL_KEY, from: live.startedAt, to: null }]
		: windows;
}

/** A message's row key: the same before and after the server confirms it (see Message.clientId). */
const rowKey = (message: Message) => message.clientId ?? message.id;

/**
 * Interleaves day separators and time lines (a gap of an hour or more), marks where each author's run of messages
 * starts and ends, and folds the trigger batches between
 * two messages into one `events` item. Batches older than the first loaded message are left out: the server only
 * sends those newer than it, so paging history in never makes a line appear or change above the reader. A voice call's
 * record folds what was said from its start until it ended into one `call` item; `liveCall` (a call going on now, on
 * this device) folds everything since it started into one at the end.
 */
export function toThreadItems(
	messages: Message[],
	batches: TriggerBatch[] = [],
	opts: { liveCall?: { startedAt: string } } = {},
): ThreadItem[] {
	const calls = callWindows(messages, opts.liveCall);
	const onCall = new Map<string, Message[]>();
	const folded = new Set<string>();
	for (const message of messages) {
		if (message.call) continue;
		const call = calls.find(
			(c) => message.at >= c.from && (c.to === null || message.at <= c.to),
		);
		if (!call) continue;
		folded.add(message.id);
		onCall.set(call.key, [...(onCall.get(call.key) ?? []), message]);
	}
	const underMessage = turnTasks(messages.filter((m) => !folded.has(m.id)));
	for (const cards of underMessage.values())
		for (const card of cards) folded.add(card.id);
	const first = messages[0];
	const quiet = batches
		.filter((b) => b.count > 0 && (!first || b.at >= first.at))
		.sort((a, b) => a.at.localeCompare(b.at));
	const items: ThreadItem[] = [];
	let lastDay: string | undefined;
	let previous: Message | undefined;
	let next = 0;

	const startDay = (at: string) => {
		const day = toDateString(new Date(at));
		const newDay = day !== lastDay;
		if (newDay) items.push({ kind: "day", key: `day-${day}`, date: day, at });
		lastDay = day;
		return newDay;
	};
	const foldBatches = (before: string | undefined) => {
		const folded: TriggerBatch[] = [];
		while (
			next < quiet.length &&
			(before === undefined || quiet[next]!.at < before)
		)
			folded.push(quiet[next++]!);
		if (!folded.length) return;
		startDay(folded[0]!.at);
		items.push({
			kind: "events",
			key: `events-${folded[0]!.id}`,
			count: folded.reduce((sum, b) => sum + b.count, 0),
			handling: folded.reduce((sum, b) => sum + (b.finished ? 0 : b.count), 0),
			toolkits: [...new Set(folded.map((b) => b.toolkit))],
			from: folded[0]!.at,
			to: folded[folded.length - 1]!.at,
			batchIds: folded.map((b) => b.id),
		});
		previous = undefined;
	};

	const pushCall = (
		key: string,
		at: string,
		startedAt: string,
		durationMs: number | null,
	) => {
		startDay(at);
		items.push({
			kind: "call",
			key,
			at,
			startedAt,
			durationMs,
			messages: onCall.get(key) ?? [],
		});
		previous = undefined;
	};

	let lastAt: number | undefined;
	for (const message of messages) {
		if (folded.has(message.id)) continue;
		foldBatches(message.at);
		if (message.call) {
			pushCall(
				`call-${rowKey(message)}`,
				message.at,
				message.call.startedAt,
				message.call.durationMs,
			);
			lastAt = new Date(message.at).getTime();
			continue;
		}
		const at = new Date(message.at).getTime();
		const newDay = startDay(message.at);
		if (!newDay && lastAt !== undefined && at - lastAt >= TIME_GAP_MS) {
			items.push({
				kind: "time",
				key: `time-${rowKey(message)}`,
				at: message.at,
			});
			previous = undefined;
		}
		const sameAuthor =
			!newDay &&
			previous !== undefined &&
			previous.authorId === message.authorId &&
			previous.authorDevId === message.authorDevId &&
			at - new Date(previous.at).getTime() < GROUP_WINDOW_MS;
		const tasks = underMessage.get(message.id);
		const slim = isTaskCard(message) ? { slim: true as const } : {};
		items.push({
			kind: "message",
			key: rowKey(message),
			message,
			first: !sameAuthor,
			last: true,
			...slim,
			...(tasks ? { tasks } : {}),
		});
		previous = message;
		lastAt = at;
	}
	foldBatches(undefined);
	if (opts.liveCall)
		pushCall(
			LIVE_CALL_KEY,
			opts.liveCall.startedAt,
			opts.liveCall.startedAt,
			null,
		);
	// A message ends its run unless the next item carries the run on.
	for (let i = 0; i < items.length; i++) {
		const item = items[i]!;
		const after = items[i + 1];
		if (item.kind === "message" && after?.kind === "message" && !after.first)
			items[i] = { ...item, last: false };
	}
	return items;
}

/** Whether a thread item shows a message: its own, or one of the task cards folded under it. */
export function itemHolds(
	item: ThreadItem | { kind: string },
	messageId: string | null | undefined,
): boolean {
	if (!messageId || item.kind !== "message") return false;
	const m = item as Extract<ThreadItem, { kind: "message" }>;
	return (
		m.message.id === messageId || !!m.tasks?.some((r) => r.id === messageId)
	);
}

/**
 * A message that is only a task's card (a Dev's or a person's new task): no words of its own shown, nothing quoted,
 * no file, sketch, question, voice or call.
 */
const isTaskCard = (m: Message) =>
	!!m.taskId &&
	!m.file &&
	!m.appId &&
	!m.question &&
	!m.voice &&
	!m.call &&
	!m.replyTo &&
	!m.upload;

/**
 * The task cards a Dev made in a turn that also wrote a message, by that message's id: they fold under it, so a
 * follow-up it gave itself or the tasks it handed out read as part of what it said, not as messages of their own. A card
 * goes under the turn's nearest message before it, else the nearest after it; never under a question, whose card is
 * drawn apart from the bubbles. A person's task, and a Dev's made in a turn that said nothing (a task turn that only
 * adds the next one), keep their own slim line.
 */
function turnTasks(messages: Message[]): Map<string, Message[]> {
	const said = new Map<string, number[]>();
	messages.forEach((m, i) => {
		if (m.turnId && m.authorDevId && !isTaskCard(m) && !m.call && !m.question)
			said.set(m.turnId, [...(said.get(m.turnId) ?? []), i]);
	});
	const under = new Map<string, Message[]>();
	messages.forEach((m, i) => {
		if (!m.turnId || !m.authorDevId || !isTaskCard(m)) return;
		const spots = (said.get(m.turnId) ?? []).filter(
			(j) => messages[j]!.authorDevId === m.authorDevId,
		);
		const host = spots.filter((j) => j < i).pop() ?? spots.find((j) => j > i);
		if (host === undefined) return;
		const id = messages[host]!.id;
		under.set(id, [...(under.get(id) ?? []), m]);
	});
	return under;
}

/** "Today", "Yesterday", else "Thursday, 8 October". */
export function formatDay(date: string, now: Date): string {
	const today = toDateString(now);
	const yesterday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() - 1,
	);
	if (date === today) return "Today";
	if (date === toDateString(yesterday)) return "Yesterday";
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

/** A day or time line's words, iMessage's: "Today 9:41 AM" where a day opens, the time alone where talk resumes. */
export function threadTimeLabel(
	item: Extract<ThreadItem, { kind: "day" | "time" }>,
	now: Date,
	timeOf: (iso: string) => string,
): string {
	return item.kind === "day"
		? `${formatDay(item.date, now)} ${timeOf(item.at)}`
		: timeOf(item.at);
}
