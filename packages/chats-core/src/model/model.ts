/** A person in the user's chats (Devs are `Dev`s). */
export interface Member {
	id: string;
	name: string;
}

/**
 * A conversation. `direct` is a 1:1 between you and one of your Devs (your default chat is the one with your
 * personal Dev); `group` has any number of people and Devs.
 */
export interface Chat {
	id: string;
	title: string;
	kind: "direct" | "group";
	memberIds: string[];
	/** Members who may rename the group. */
	ownerIds: string[];
	/** Devs allowed in this chat: a group's own Dev plus any members let in; a 1:1's one Dev. */
	devIds: string[];
	/** Who let each Dev into the chat (by Dev id), where the server said: "Added by Nina" on a registry Dev. */
	devAddedBy?: Record<string, string>;
}

/** An MCP server as its owner sees it: header names only, never their values. */
export interface McpServer {
	id: string;
	name: string;
	url: string;
	headerNames: string[];
}

/**
 * An agent. Everyone names a `personal` Dev at onboarding; each group has its own `group` Dev; `custom` agents
 * are ones a person made; `added` ones were added to a group from the registry and belong to it, as its own Dev
 * does. Names can repeat, so the id is the identity.
 */
export interface Dev {
	id: string;
	kind: "personal" | "group" | "custom" | "added";
	name: string;
	/** Avatar tile colour, `#RRGGBB`. */
	color: string;
	/** The person who made a personal or custom Dev; null for a group's own or added Dev. */
	ownerId: string | null;
	/** What it's for, as this user reads it: "Your personal Dev", "Priya's personal Dev · …", "The Dev of Goa trip". */
	description: string;
	/**
	 * The part of the description its editors change: a personal Dev owner's text after the generated opening, the
	 * whole description otherwise. Only shown to those who may edit it.
	 */
	descriptionText?: string;
	/** Whether its owner lets it act in Paradev with the owner's access; only shown to the owner. */
	paradevAccess?: boolean;
	/** The owner's plugins it may use, by name; only shown to the owner. */
	plugins?: string[];
	/** Its chosen look (core's `DEV_LOOK_IDS`: a character's id, or "plain"); null or absent: dressed by its words. */
	look?: string | null;
	/** The voice it speaks in (core's `DEV_VOICES` id); null or absent: the server's default voice. */
	voice?: string | null;
	/** The registry listing it came from, and which version; absent for a Dev made in Dev. */
	listing?: { slug: string; version: string } | null;
}

export interface Message {
	id: string;
	/**
	 * The id the sender's device gave it before the server confirmed it (its optimistic copy's id), when it has one. Rows
	 * are keyed by it, so a sent message's row stays the same row when the server's copy replaces the optimistic one.
	 */
	clientId?: string;
	chatId: string;
	/** The person who wrote it; `null` for a Dev's message and for system notes ("You added Budget"). */
	authorId: string | null;
	/** Set when a Dev wrote it. Neither author set: a system note. */
	authorDevId?: string;
	text: string;
	/** ISO timestamp. */
	at: string;
	/** Set when the message shared a task; the card renders from the task, so it stays live. */
	taskId?: string;
	/** Set when the message is an app's card (a publish, restore or share); it renders from the app, so it stays live. */
	appId?: string;
	/** The version the card announced. */
	appVersion?: number;
	/** The Dev turn that wrote it; its trace is fetched when someone opens the message's details. */
	turnId?: string;
	/** Set when a Dev asked the chat something; the message renders as the question's card. */
	question?: Question;
	/** Set when the message shares a file; it renders as the file's card, with `text` as its caption. */
	file?: SharedFile;
	/** Set when the message replies to another: the original's author and first line, shown as a quote over it. */
	replyTo?: ReplyQuote;
	/** Set on a voice note: `file` is its audio and `text` what was said (empty while it's transcribed). */
	voice?: VoiceNote;
	/** Set on a voice call's record, posted at hang-up: what was said on the call folds into it in the thread. */
	call?: CallRecord;
	/** When its author last edited its text (ISO); shown as "Edited" by its time. */
	editedAt?: string;
	/** The name of the API key a person sent it with (their script, Claude Code…); shown as "via <name>" under it. */
	viaKey?: string;
	/** This device's own file or voice note, still on its way up; never from the server. */
	upload?: MessageUpload;
	/**
	 * This device's own copy of the file it shared (a `blob:` or `file://` URL), drawn in place of the shared file's link
	 * so a picture never blinks as its send is confirmed; never from the server.
	 */
	localUri?: string;
}

/**
 * How far a file this device is sending has gone up: bytes sent of its size, or why it failed (to retry or drop). A
 * text message that couldn't be sent has one too, with `error` only.
 */
export interface MessageUpload {
	sent: number;
	total: number;
	error?: string;
}

/** A voice call with a 1:1's Dev, as its record in the chat keeps it. */
export interface CallRecord {
	/** When it started (ISO); the record's own time is when it ended. */
	startedAt: string;
	durationMs: number;
}

/**
 * A voice note's recording, as its bubble draws it. A person's is transcribed by the server after it posts (its text
 * fills in then); a Dev's is its reply, spoken, and already has its words.
 */
export interface VoiceNote {
	durationMs: number;
	/** Loudness per bar, 0 to 1, `VOICE_WAVEFORM_BARS` of them, oldest first. */
	waveform: number[];
	status: "transcribing" | "done" | "failed";
	/** A Dev's spoken reply: each word said and when, so the words light up as they're spoken. */
	words?: SpokenWord[];
}

/** A word in a spoken reply, as heard: its text (punctuation attached) and when it's said. */
export interface SpokenWord {
	text: string;
	startMs: number;
	endMs: number;
}

/**
 * How far someone has read a chat: a person, or a Dev (whose turns are given the chat). Reads only move forward and
 * are ordered by the read message's time, which holds when that message is deleted.
 */
/** One topic of a Dev's brief of a chat: what's happening with it, and whether it waits on someone here. */
export interface BriefTopic {
	topic: string;
	line: string;
	needsYou: boolean;
}

/** A Dev's brief of a chat: a line per topic in play, kept by the Dev as the work changes. */
export interface ChatBrief {
	chatId: string;
	devId: string;
	topics: BriefTopic[];
	/** ISO time it was last written. */
	updatedAt: string;
}

export interface ChatRead {
	chatId: string;
	reader: { kind: "person" | "dev"; id: string };
	messageId: string;
	/** ISO time of the read message. */
	messageAt: string;
	/** ISO time it was read. */
	at: string;
}

/** The message a reply quotes, as the reply carries it (the original may not be loaded, or may be long gone by then). */
export interface ReplyQuote {
	id: string;
	authorName: string;
	/** `note`: one of Dev's own notes. */
	authorKind: "person" | "dev" | "note";
	/** The person's or the Dev's id; null for a note. */
	authorId: string | null;
	/** The original's first line, plain text, at most 140 characters. */
	text: string;
}

/**
 * One trigger turn in a chat: the events a Dev's trigger took at once, and what the Dev did with them. The chat
 * shows batches between its messages as "N events handled"; who sees the events' titles is the API's call.
 */
export interface TriggerBatch {
	id: string;
	chatId: string;
	/** Null once the trigger is gone. */
	triggerId: string | null;
	/** The Composio toolkit the events came from, e.g. `linear`. */
	toolkit: string;
	count: number;
	/** ISO timestamp: when the turn took the events. */
	at: string;
	/** The Dev's final text for the batch; null until the turn settles. */
	outcome: string | null;
	/** False while the Dev is handling the events: the chat says so until it's done. */
	finished: boolean;
}

/**
 * A file shared in a chat: a Dev's `dev file share` today, a person's attachment later. Its bytes stay with the
 * API; a member opens them through a short-lived link the API signs for them.
 */
export interface SharedFile {
	id: string;
	chatId: string;
	/** The file's name, extension included, as it is saved. */
	name: string;
	/** What the card calls it, when the sharer gave it a title; empty otherwise. */
	title: string;
	mime: string;
	/** Bytes. */
	size: number;
	/** Who shared it; null once they're gone. */
	sharedBy: { kind: "user" | "dev"; id: string } | null;
	/** The first lines of a text, markdown or CSV file; empty for anything else. */
	preview: string;
	createdAt: string;
}

/** One option of a Dev's question. */
export interface QuestionOption {
	label: string;
	description?: string;
}

/** One question of a `form`: pick one option, or several with `multiSelect`, and type one under "Other…" with `allowOther`. */
export interface QuestionPart {
	/** A short label for it ("Dates"), shown over it and with its answer. */
	header: string;
	title: string;
	options: QuestionOption[];
	allowOther: boolean;
	multiSelect: boolean;
}

/** One part's answer: the options picked, in the part's order, and what was typed under "Other…", if anything. */
export interface QuestionPartAnswer {
	picked: string[];
	typed: string | null;
}

/**
 * A Dev's question to the chat, asked mid-turn: pick an option (`select`), yes or no (`confirm`), type an answer
 * (`input`), or answer several questions at once (`form`, its `parts`, sent together). The first answer wins; while it's `open`, only `forUserId` (or, when null, anyone in the chat) may answer,
 * and an answer after the asking turn ended reaches the Dev in a new turn. A question nobody answered in time is
 * `expired` (the card says the Dev moved on, and still takes a late answer); one whose turn was stopped first is
 * `cancelled`.
 */
export interface Question {
	id: string;
	devId: string | null;
	/** The task the asking turn was working on. */
	taskId: string | null;
	kind: "select" | "confirm" | "input" | "form";
	/** The question; a form's heading ("Dates · Budget"), its questions in `parts`. */
	title: string;
	/** More about a yes/no question. */
	body: string;
	options: QuestionOption[];
	/** A form's questions; absent or empty for the other kinds (and from an API that predates forms). */
	parts?: QuestionPart[];
	/** A `select` that also takes a typed answer ("Other…"). */
	allowOther: boolean;
	placeholder: string;
	/** Who may answer; null for anyone in the chat. */
	forUserId: string | null;
	status: "open" | "answered" | "cancelled" | "expired";
	/** An option's label, the typed text, or `yes` / `no`; a form's answers as one text (`formAnswerText`). */
	answer: string | null;
	/** A form's answers, one per part. */
	answers?: QuestionPartAnswer[] | null;
	/** The answer was typed rather than picked. */
	typed: boolean;
	answeredBy: string | null;
	answeredAt: string | null;
	expiresAt: string;
}

/**
 * Where a task stands. A Dev's task is `in_progress` while its turn works on it and `done` when the turn ends (what
 * people need is said in the chat); while it waits on someone's answer to a question it stays in progress, and a
 * Dev that can't finish it puts it back to `todo`.
 */
export type TaskStatus = "todo" | "in_progress" | "done";

/** The series a repeating task's occurrences come from. */
export interface TaskRepeat {
	seriesId: string;
	/** RFC 5545 RRULE, e.g. `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`. */
	rrule: string;
	/** The creator's IANA time zone: occurrences keep their wall-clock time in it across DST. */
	timezone: string;
	/** "Every weekday at 09:00". */
	text: string;
	/** The next occurrence still to come (ISO), or null once the rule has run out. */
	nextAt: string | null;
}

export interface Task {
	id: string;
	chatId: string;
	title: string;
	description: string;
	status: TaskStatus;
	/** A person doing it; at most one of `assigneeId` and `assigneeDevId` is set. */
	assigneeId: string | null;
	/** A Dev doing it: it works on the task in this chat, on its own box, and posts here. */
	assigneeDevId: string | null;
	/** Local calendar date, `YYYY-MM-DD`, for tasks without a time. */
	due: string | null;
	/**
	 * A time (ISO). For a Dev's task without `remind`: when it starts (no time: it starts at once). Otherwise: when
	 * Dev reminds the chat.
	 */
	scheduledAt: string | null;
	/** The time is a reminder: a Dev assignee starts at once, and the chat is reminded at the time. */
	remind: boolean;
	/** Free-form tags as typed, in order; an app's name ("Gmail") is one too. */
	labels?: string[];
	/** Links into other apps (a Linear issue, a Superset workspace, a Notion page) found in its words and saved by the API; absent from older caches. */
	links?: string[];
	repeat: TaskRepeat | null;
	createdAt: string;
	/** When it was last marked done; absent from older fixtures and caches. */
	completedAt?: string | null;
	/** The person who made it, if a person did. */
	createdBy?: string | null;
	/** The Dev that made it, if one did: who handed a person a task. */
	createdByDevId?: string | null;
}

/** What happened to a task, for its activity log (which includes the Dev's work log). */
export type TaskActivityKind =
	| "created"
	| "assigned"
	| "scheduled"
	| "started"
	| "progress"
	| "comment"
	| "status"
	| "done"
	| "reopened"
	| "reminded"
	| "edited"
	| "failed";

export interface TaskActivity {
	id: string;
	taskId: string;
	kind: TaskActivityKind;
	/** The comment or progress note, the new status, or what changed; may be empty. */
	text: string;
	/** Who did it; null for Dev itself (a reminder, a run that failed). */
	actor: { kind: "user" | "dev"; id: string } | null;
	at: string;
}

/** One publish of an app; restoring an older one publishes it again under a new number. */
export interface AppVersion {
	number: number;
	/** What changed, in the publisher's words; may be empty. */
	label: string;
	createdAt: string;
	/** The size of its picture (see `sketchPicture`) in CSS pixels; null when it has none. */
	preview?: { width: number; height: number } | null;
}

/**
 * An app that lives inside a chat, which people see as a sketch: a chart, a plan, a tool. A `draft` holds only its
 * brief; a Dev's first publish makes it `live`, served from its own origin at `url`. Only a `saved` one is listed
 * (the chat's tabs, the sidebar) and keeps data; an unsaved one lives in its message.
 */
export interface App {
	id: string;
	chatId: string;
	name: string;
	/** The brief: what the app should do, in the user's words. */
	description: string;
	/** 1–12, an index into CORE's avatar palette (`--custom-color-N`). */
	color: number;
	status: "draft" | "live";
	/** The version on show; null for a draft. */
	version: AppVersion | null;
	/** Where the current version is served; null for a draft. */
	url: string | null;
	/** The Dev that first published it (see `appAgentId`); null when a person made it or that Dev is gone. */
	creatorDevId: string | null;
	saved: boolean;
	createdAt: string;
}
