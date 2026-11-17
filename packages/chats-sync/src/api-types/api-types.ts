import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type {
	CallRecord,
	McpServer,
	Question,
	RepeatDraft,
	ReplyQuote,
	SharedFile,
	SpokenWord,
	TaskActivity,
	TaskDraft,
	TaskRepeat,
	TaskStatus,
	TaskViewSpec,
	VoiceNote,
} from "@superset/chats-core";

/** JSON shapes of the Dev API (apps/server/src). The API says `groupId` where core says `chatId`. */
export interface ApiUser {
	id: string;
	email: string;
	name: string | null;
	displayName: string;
}

type ApiMember = ApiUser & { role: "owner" | "member" };

export interface ApiGroup {
	id: string;
	kind: "direct" | "group";
	title: string;
	members: ApiMember[];
}

/** What an invite link's card shows before joining (`GET /invites/:token/preview`). */
export interface ApiInvitePreview {
	groupId: string;
	title: string;
	/** Who made the link; null once they've deleted their account. */
	invitedBy: string | null;
	/** The first few people in the group, by when they joined; `peopleCount` is all of them. */
	people: { id: string; name: string }[];
	peopleCount: number;
	/** The group's own Dev. */
	dev: { name: string; color: string; description: string } | null;
	/** The viewer is already in the group. */
	joined: boolean;
	expiresAt: string;
}

export interface ApiDev {
	id: string;
	kind: "personal" | "group" | "custom" | "added";
	name: string;
	color: string;
	ownerUserId: string | null;
	groupId: string | null;
	status: "stopped" | "waking" | "idle" | "running";
	createdAt: string;
	/** Worded for the viewer: "Your personal Dev" to its owner, "Priya's personal Dev" to everyone else. */
	description: string;
	/** What its editors change (see Dev.descriptionText); only for them. */
	descriptionText?: string;
	/** Whether its owner lets it act in Paradev with the owner's access; only for the owner. */
	paradevAccess?: boolean;
	/** Its chosen look (core's `DEV_LOOK_IDS`), null when dressed by its words; absent from servers before looks. */
	look?: string | null;
	/** Its voice (core's `DEV_VOICES`), null for the default; absent from servers before voices. */
	voice?: string | null;
	/** The registry listing it came from, and its version; null for one made in Dev, absent from servers before. */
	listing?: { slug: string; version: string } | null;
}

export interface ApiGroupDev {
	groupId: string;
	devId: string;
	addedBy: string | null;
}

export interface ApiMessage {
	id: string;
	groupId: string;
	authorId: string | null;
	authorDevId: string | null;
	text: string;
	taskId: string | null;
	/** Absent from servers older than app cards. */
	appId?: string | null;
	appVersion?: number | null;
	/** The Dev turn that wrote it (absent from older servers and for people's messages). */
	turnId?: string | null;
	/** Set on a Dev's question; the message renders as its card. */
	question?: ApiQuestion;
	/** Set when the message shares a file; the API sends core's `SharedFile` as is. */
	file?: SharedFile;
	/** Set on a reply: the quoted message, as core's `ReplyQuote`; absent from servers older than replies. */
	replyTo?: ReplyQuote | null;
	/** Set on a voice note, as core's `VoiceNote`; `file` is its recording. */
	voice?: VoiceNote;
	/** Set on a voice call's record, as core's `CallRecord`; absent from servers older than calls. */
	call?: CallRecord;
	/** Set once its author edited its text; absent from servers older than edits. */
	editedAt?: string;
	/** The API key's name when a person sent it with one; absent otherwise and from servers older than keys. */
	viaKey?: string;
	clientId: string | null;
	at: string;
}

/** A Dev's question: the API sends core's `Question` as is. */
export type ApiQuestion = Question;

/** What a finished turn did, as its box reported it: ACP updates, prompt left out, long output cut. */
export interface ApiTurnTrace {
	model: string | null;
	updates: SessionUpdate[];
	/** The turn did more than a trace keeps; the rest was dropped. */
	truncated?: boolean;
}

/** A Dev's turn, as a message's details show it. Times are ISO; `trace` is null until (unless) the box reported it. */
export interface ApiTurnDetails {
	id: string;
	devId: string;
	groupId: string;
	parentTurnId: string | null;
	status: "queued" | "running" | "ended";
	error: string | null;
	createdAt: string;
	startedAt: string | null;
	settledAt: string | null;
	endedAt: string | null;
	trace: ApiTurnTrace | null;
}

/** `GET /messages/:id/details`: the message, the turn that wrote it, and the `dev ask` turns that turn started. */
export interface ApiMessageDetails {
	message: ApiMessage;
	turn: ApiTurnDetails | null;
	asks: ApiTurnDetails[];
}

export interface ApiTask {
	id: string;
	groupId: string;
	title: string;
	description: string;
	status: TaskStatus;
	assigneeId: string | null;
	assigneeDevId: string | null;
	due: string | null;
	scheduledAt: string | null;
	remind: boolean;
	labels: string[];
	/** Absent from an API from before tasks saved their links. */
	links?: string[];
	repeat: TaskRepeat | null;
	createdBy: string | null;
	createdByDevId: string | null;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
}

/** An entry of a task's activity (`GET /tasks/:id/activity`, `task.activity` events); core's `TaskActivity`, by group. */
export type ApiTaskActivity = TaskActivity;

/** A task change as `PATCH /tasks/:id` takes it; `assignee` is a mention token, `me`, a name or null. */
export interface TaskPatch {
	title?: string;
	description?: string;
	status?: TaskStatus;
	assignee?: string | null;
	due?: string | null;
	scheduledAt?: string | null;
	remind?: boolean;
	labels?: string[];
	repeat?: RepeatDraft | null;
}

/** A new task from a form (`POST /groups/:id/tasks`): like a `/task` draft, with a description. */
export interface TaskForm extends Omit<TaskDraft, "assignee" | "error"> {
	description: string;
	assignee: string | null;
}

export interface ApiApp {
	id: string;
	groupId: string;
	name: string;
	description: string;
	color: number;
	status: "draft" | "live";
	version: {
		number: number;
		label: string;
		createdAt: string;
		preview?: { width: number; height: number } | null;
	} | null;
	/** The current version on the app's own origin; null for a draft. */
	url: string | null;
	/** Saved for the chat: listed (the chat's tabs, the sidebar) and keeps data. Unsaved, it lives in its message. */
	saved: boolean;
	/** The Dev that first published it; null when a person made it or that Dev is gone. */
	createdByDevId: string | null;
	createdAt: string;
}

/** One entry of an app's history (`GET /apps/:id/versions`), newest first. */
export interface ApiAppVersion {
	number: number;
	label: string;
	kind: "jsx" | "html";
	createdAt: string;
	author: { kind: "person" | "dev"; id: string; name: string } | null;
	current: boolean;
}

/** A storage item as the API returns it; `value` is JSON text. */
export interface ApiStorageItem {
	key: string;
	value: string;
	updatedAt: string;
	updatedBy: string;
}

/**
 * A change to an app's storage: shared ones on the group's channel, personal ones on the viewer's. `value` is the new
 * JSON text, null when deleted; absent (`large`) when too big to ride along.
 */
export interface AppStorageEvent {
	type: "app.storage";
	appId: string;
	scope: "personal" | "shared";
	key: string;
	value?: string | null;
	large?: true;
	updatedBy: string;
}

/** A saved task view (`/task-views`): the spec as the server cleaned it. */
/** A member's invitations to Dev: how many are left of their three, and whom they've invited. */
export interface ApiInvitations {
	left: number;
	invitations: { email: string; createdAt: string; joined: boolean }[];
}

export interface ApiTaskView {
	id: string;
	name: string;
	spec: TaskViewSpec;
}

export interface Bootstrap {
	user: ApiUser;
	needsOnboarding: boolean;
	devs: ApiDev[];
	/** Whether voice notes work on this server (it has an ElevenLabs key); absent from servers older than voice notes. */
	voiceNotes?: boolean;
	/** The person's saved task views, oldest first; absent from servers older than saved views. */
	taskViews?: ApiTaskView[];
	groups: ApiGroup[];
	groupDevs: ApiGroupDev[];
	/** Each chat's latest messages (up to 200). */
	messages: ApiMessage[];
	/** Chats with messages before those, which `GET /groups/:id/messages?beforeId=` pages back through. */
	groupsWithOlderMessages: string[];
	/** Open tasks, those done in the last 30 days, and any task the messages carry as a card. */
	tasks: ApiTask[];
	/** Saved apps, and the unsaved sketches the messages carry. */
	apps: ApiApp[];
	/** Each chat's trigger batches since its oldest loaded message; absent from servers older than triggers. */
	triggerBatches?: ApiTriggerBatch[];
	/** How far each person and Dev has read each chat; absent from servers older than reads. */
	reads?: ApiChatRead[];
	/**
	 * The viewer's unread messages per chat, up to 99, as the server counts them. The apps count from the messages and
	 * reads they hold (core's `unreadCounts`), which stays live; this is for a client that holds no messages.
	 */
	unread?: Record<string, number>;
	/** Each chat's Devs' briefs; absent from servers older than briefs. */
	briefs?: ApiChatBrief[];
}

/** How far someone has read a chat (`chat.read` events, the bootstrap): a person (`userId`) or a Dev (`devId`). */
/** A Dev's brief of a chat (`chat.brief` events, the bootstrap). */
export interface ApiChatBrief {
	groupId: string;
	devId: string;
	topics: { topic: string; line: string; needsYou: boolean }[];
	updatedAt: string;
}

export interface ApiChatRead {
	groupId: string;
	userId: string | null;
	devId: string | null;
	messageId: string;
	/** The read message's time, which orders reads. */
	messageAt: string;
	/** When it was read. */
	at: string;
}

/** A page of a chat's older messages (`GET /groups/:id/messages?beforeId=…&cards=1`) with the apps and tasks they carry as cards. */
export interface ApiMessagePage {
	messages: ApiMessage[];
	apps: ApiApp[];
	tasks: ApiTask[];
}

/** What `POST /groups/:id/messages` returns, and the payload of a `message.created` event. */
export interface SentMessage {
	message: ApiMessage;
	task: ApiTask | null;
}

/** What `POST /groups/:id/messages` returns: plain `@Name`s several Devs share woke nobody, so the sender should pick one. */
export interface SendResult extends SentMessage {
	ambiguousMentions?: string[];
}

/** What `POST /groups/:id/files/uploads` returns: the upload's id and how to cut the file into parts. */
export interface FileUpload {
	uploadId: string;
	partBytes: number;
	parts: number;
}

/** What `POST /groups/:id/files` returns: the shared file and the message carrying its card. */
export interface SharedFileResult {
	file: SharedFile;
	message: ApiMessage;
	ambiguousMentions?: string[];
}

/** What `POST /groups/:id/apps` returns, and the payload of an `app.created` event. */
export interface CreatedApp {
	app: ApiApp;
	/** The note that the sketch was added; null when the request is a repeat of one the server had already answered. */
	message: ApiMessage | null;
}

/** A new 1:1 or group with its Dev: what creating a Dev or a group returns. */
/** Where to stream a voice note as it's recorded (ElevenLabs' realtime Scribe) and the single-use pass for it. */

/** A Dev's message read aloud for a voice call (`POST /voice/speak`), or a voice's sample (`POST /voice/preview`). */
export interface CallSpeech {
	/** Base64'd 16-bit little-endian mono PCM at `sampleRate`. */
	pcm: string;
	sampleRate: number;
	durationMs: number;
	words: SpokenWord[];
}

export interface CreatedChat {
	group: ApiGroup;
	dev: ApiDev;
	groupDev: ApiGroupDev;
	/** A new personal or custom Dev's first turn in its 1:1, already starting; absent from older servers. */
	firstTurnId?: string | null;
}

/** Where a registry listing goes: a Dev of the viewer's own, or one added to a group they're in. */
export type InstallTarget =
	| { kind: "you" }
	| { kind: "group"; groupId: string };

/** What `POST /registry/:slug/install` returns: the new Dev's 1:1 (for you), or its place in the group. */
export type InstalledListing =
	| CreatedChat
	| (AddedGroupDev & { firstTurnId?: string | null });

/** What `POST /groups/:id/devs/:devId` returns, and the payload of a `group_dev.added` event. */
export interface AddedGroupDev {
	groupDev: ApiGroupDev;
	dev: ApiDev;
}

/** `GET /integrations`: the person's own MCP servers (header names only). Superset is a connected app (`ApiToolkit`). */
export interface ApiIntegrations {
	mcpServers: McpServer[];
}

/** Which of its owner's integrations a Dev uses: connected apps by Composio toolkit (`gmail`), MCP servers by id. */
export interface ApiDevIntegrations {
	toolkits: string[];
	mcpServerIds: string[];
}

/** One of the apps Dev connects, as an app's viewer sees it: connected or not, their accounts, their allow/deny per tool. */
export interface ApiAppIntegration {
	/** The Composio toolkit (`gmail`). */
	name: string;
	displayName: string;
	connected: boolean;
	/** With several, a call has to name one. */
	accounts: { id: string; label: string }[];
	/** By Composio tool slug (`GMAIL_SEND_EMAIL`). */
	tools: Record<string, boolean>;
}

/** `GET /apps/:id/integrations`: `configured` is false where the server has no connected apps. */
export interface ApiAppIntegrations {
	configured: boolean;
	plugins: ApiAppIntegration[];
}

/** One of an app's tools as `dev.plugins.tools(app)` gives it: Composio's slug, its title and arguments (JSON Schema). */
export interface ApiAppTool {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/** A person's connected account (Linear, Gmail, YNAB…); `label` names it (an email, a workspace, a budget). */
export interface ApiComposioAccount {
	id: string;
	toolkit: string;
	label: string;
	status: "active" | "pending" | "expired";
}

/** One choice for a field that takes an id: the id it saves and the name people see. */
export interface ApiTriggerOption {
	value: string;
	label: string;
}

/** One setting of a trigger type (a Linear team, a Gmail label…). */
export interface ApiTriggerField {
	name: string;
	label: string;
	type: "string" | "number" | "boolean";
	required: boolean;
	description?: string;
	default?: string | number | boolean;
	/** The account's choices (its teams, its projects), from `composioAccountOptions`; free text without them. */
	options?: ApiTriggerOption[];
}

/** An event a toolkit can tell a Dev about, e.g. `LINEAR_ISSUE_CREATED_TRIGGER`. */
export interface ApiTriggerType {
	slug: string;
	name: string;
	description: string;
	fields: ApiTriggerField[];
}

/**
 * An app people connect (`GET /composio/toolkits`): one of Composio's, connected through its sign-in link, or one of
 * Dev's own (YNAB), connected by pasting a key; the viewer's accounts for it and the events it offers.
 */
export interface ApiToolkit {
	slug: string;
	name: string;
	connect: "link" | "key";
	/** For an app connected by key: where to make one, and what to do there. */
	keyHelp?: { url: string; hint: string };
	accounts: ApiComposioAccount[];
	triggerTypes: ApiTriggerType[];
}

/**
 * A Dev listening, in one chat, to one event of one person's account; `instructions` say what to do with it. A
 * built-in one (`task_comments`: comments on tasks assigned to the Dev) has no account and is the chat's: anyone
 * in it sees its events, pauses it or changes its instructions, and nobody removes it.
 */
export interface ApiTrigger {
	id: string;
	devId: string;
	groupId: string;
	kind: "composio" | "task_comments";
	/** Whose account it runs on; for a built-in one, the Dev's owner (null for a group's Dev). */
	userId: string | null;
	toolkit: string;
	accountId: string | null;
	accountLabel: string;
	triggerType: string;
	triggerName: string;
	config: Record<string, string | number | boolean>;
	title: string;
	instructions: string;
	paused: boolean;
	eventsToday: number;
	createdAt: string;
	updatedAt: string;
}

/** One trigger turn: the events it took and what the Dev did (its final text, null until it settles). */
export interface ApiTriggerBatch {
	id: string;
	groupId: string;
	/** Null once the trigger is gone. */
	triggerId: string | null;
	toolkit: string;
	/** 0 when its turn gave the events back: it leaves the thread. */
	count: number;
	at: string;
	outcome: string | null;
	/** False while its turn handles the events; absent from servers that sent only finished batches. */
	finished?: boolean;
}

/**
 * An event a trigger received. `title`, `subtitle` (Gmail's sender, a Linear issue's team and state), `url` (where it
 * opens) and `note` are null unless the viewer is the trigger's person; everyone sees `action`.
 */
export interface ApiTriggerEvent {
	id: string;
	triggerId: string;
	batchId: string | null;
	toolkit: string;
	title: string | null;
	subtitle?: string | null;
	url?: string | null;
	status: "pending" | "handled" | "dropped" | "capped";
	/** What the Dev said it did (`report_events`); null when it didn't say, or hasn't yet. */
	action?: "told" | "acted" | "skipped" | null;
	note?: string | null;
	receivedAt: string;
}

/** A new trigger as `POST /groups/:id/triggers` takes it. */
export interface TriggerForm {
	devId: string;
	toolkit: string;
	accountId: string;
	triggerType: string;
	config: Record<string, string | number | boolean>;
	title: string;
	instructions: string;
}

/** A trigger change as `PATCH /triggers/:id` takes it. */
export interface TriggerPatch {
	title?: string;
	instructions?: string;
	config?: Record<string, string | number | boolean>;
	paused?: boolean;
}

/** Events on the user's and groups' realtime channels. */
export type RealtimeEvent =
	/** `endsTurn`: a Dev's reply, which ends its turn's live view (`turn.ended` follows). */
	| ({ type: "message.created"; endsTurn?: boolean } & SentMessage)
	/** Only the message goes: a task or app it carried stays. */
	| { type: "message.deleted"; groupId: string; messageId: string }
	/** A message changed in place: a voice note's words, once transcribed. */
	| { type: "message.updated"; message: ApiMessage }
	/** A Dev asked the chat something: the question's card, as a message. */
	| { type: "question.asked"; message: ApiMessage }
	/** Someone answered (after the Dev moved on, too: the card then shows the late answer). */
	| { type: "question.answered"; groupId: string; question: ApiQuestion }
	/** Nobody answered in time, or the turn stopped asking. */
	| { type: "question.closed"; groupId: string; question: ApiQuestion }
	| { type: "task.updated"; task: ApiTask }
	| { type: "task.deleted"; groupId: string; taskId: string }
	/** A new entry in a task's activity (an open task detail appends it). */
	| { type: "task.activity"; groupId: string; activity: ApiTaskActivity }
	| ({ type: "app.created" } & CreatedApp)
	| { type: "app.deleted"; appId: string }
	/** A new version was published or restored (a draft going live included). */
	| { type: "app.updated"; app: ApiApp }
	| AppStorageEvent
	/** On the user's channel: they joined or left a group, so their realtime channels change (a new token). */
	| { type: "groups.changed" }
	| { type: "group.updated"; group: { id: string; title: string } }
	/** On each member's own channel: the group, and everything in it, is gone. */
	| { type: "group.deleted"; groupId: string; title: string; deletedBy: string }
	| { type: "member.joined"; groupId: string; member: ApiMember }
	/** A person left a group or was removed from it. */
	| { type: "member.left"; groupId: string; userId: string }
	| { type: "dev.updated"; dev: ApiDev }
	| { type: "dev.deleted"; devId: string }
	| ({ type: "group_dev.added" } & AddedGroupDev)
	| { type: "group_dev.removed"; groupId: string; devId: string }
	/** On the owner's channel: which of their integrations a Dev uses changed. */
	| {
			type: "dev.integrations";
			devId: string;
			integrations: ApiDevIntegrations;
	  }
	/** On the person's channel: their MCP servers or connected accounts changed; refetch them. */
	| { type: "integrations.changed" }
	/** On the person's channel: their saved task views changed on some device; the whole list. */
	| { type: "task_views.changed"; views: ApiTaskView[] }
	/** A Dev's box state as seen from one group (idle = box up between turns). */
	| {
			type: "dev.status";
			devId: string;
			groupId: string;
			status: ApiDev["status"];
	  }
	/** `parentTurnId`: a `dev ask` turn, nested in the asking Dev's. `triggerId`: a trigger turn, quiet in the chat. */
	| {
			type: "turn.started";
			devId: string;
			groupId: string;
			turnId: string;
			parentTurnId?: string;
			appId?: string;
			triggerId?: string;
	  }
	/** `error`: the turn failed; the server also posted a note in the chat saying why (unless an app or a trigger asked). */
	| {
			type: "turn.ended";
			devId: string;
			groupId: string;
			turnId: string;
			parentTurnId?: string;
			appId?: string;
			triggerId?: string;
			error?: string;
	  }
	| { type: "trigger.changed"; trigger: ApiTrigger }
	| { type: "trigger.deleted"; groupId: string; triggerId: string }
	/** A trigger turn took events (`finished` false), or is done (its outcome; a count of 0 when it gave them back); the same batch again replaces it. */
	| { type: "trigger.batch"; batch: ApiTriggerBatch }
	/** Someone read the chat further: a person, in an app, or a Dev, given it in a turn. */
	| ({ type: "chat.read" } & ApiChatRead)
	/** A Dev rewrote its brief of the chat. */
	| ({ type: "chat.brief" } & ApiChatBrief)
	/** A person is typing in the chat, or stopped. Live sockets only: never replayed after a reconnect. */
	| { type: "typing"; groupId: string; userId: string; typing: boolean };

/** What a sync store tells other live views (the Dev turn stream) about: every realtime event and each bootstrap. */
export type SyncSignal =
	| { type: "event"; event: RealtimeEvent; at: number }
	/**
	 * The viewer just made a Dev whose first turn is starting in its 1:1. Its `dev.status` and `turn.started` go
	 * out before the app has the chat's channel, so the app says it's getting ready itself.
	 */
	| { type: "first-turn"; devId: string; groupId: string; at: number }
	| {
			type: "bootstrapped";
			devs: Pick<ApiDev, "id" | "status">[];
			requestedAt: number;
	  };

/** What `POST /devs/:id/watch-token` returns: where the Dev's box is and a short-lived read-only token for it. */
export interface WatchTicket {
	acpUrl: string;
	token: string;
	sessionId: string;
}
