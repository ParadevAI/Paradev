import { myDev } from "../devs/devs.ts";
import { parseMentionTokens } from "../mentions/mentions.ts";
import type {
	App,
	Chat,
	ChatBrief,
	ChatRead,
	Dev,
	Member,
	Message,
	QuestionPartAnswer,
	Task,
	TaskStatus,
	TriggerBatch,
} from "../model/model.ts";
import { formAnswerText, withQuestion } from "../questions/questions.ts";
import { replyQuoteOf } from "../reply-quote/reply-quote.ts";
import { parseTaskCommand } from "../task-command/task-command.ts";
import { toggledStatus } from "../task-status/task-status.ts";
import { taskDate } from "../task-time/task-time.ts";
import type { SavedTaskView } from "../task-views/task-views.ts";

/** Everything the client shows, in one serialisable value. Persistence and sync wrap this. */
export interface ChatState {
	meId: string;
	members: Record<string, Member>;
	devs: Record<string, Dev>;
	chats: Chat[];
	messages: Message[];
	tasks: Task[];
	apps: App[];
	/** Trigger turns in each chat since its oldest loaded message, oldest first; absent before the first bootstrap that had them. */
	triggerBatches?: TriggerBatch[];
	/** Chats whose history goes back further than the messages loaded; a chat not listed has its first message here. */
	olderMessages?: Record<string, OlderMessages>;
	/** How far each person and Dev has read each chat; absent before the first bootstrap that had them. */
	reads?: ChatRead[];
	/** Whether the server takes voice notes (the apps show the mic only then). */
	voiceNotes?: boolean;
	/** Each chat's Devs' briefs; absent before a bootstrap had them. */
	briefs?: ChatBrief[];
	/** The viewer's saved task views (All tasks' tabs after the built-in ones), oldest first; absent before a bootstrap had them. */
	taskViews?: SavedTaskView[];
}

/** A chat's history before its loaded messages: whether there is more, and whether a page of it is on its way. */
export interface OlderMessages {
	hasMore: boolean;
	loading: boolean;
}

/** Size of CORE's avatar palette (`--custom-color-1` … `--custom-color-12`). */
const APP_COLOR_COUNT = 12;

export type ChatAction =
	/** `replyToId`: the message it quotes, in the same chat. */
	| { type: "send"; chatId: string; text: string; replyToId?: string }
	/** A text message that failed to send (`Message.upload.error`): sent again with the same clientId, or dropped. */
	| { type: "retry-send"; messageId: string }
	| { type: "discard-send"; messageId: string }
	| { type: "toggle-task"; taskId: string }
	/** The caller picks `appId` so it can open the new app straight away. */
	| {
			type: "create-app";
			appId: string;
			chatId: string;
			name: string;
			description: string;
	  }
	| { type: "delete-app"; appId: string }
	/** Removes only the message: a task or app it carried stays. */
	| { type: "delete-message"; messageId: string }
	/** The viewer's own text message, its words changed (see `canEditMessage`). */
	| { type: "edit-message"; messageId: string; text: string }
	/** `answer`: an option's label, typed text (`typed`), or `yes` / `no`. */
	| {
			type: "answer-question";
			questionId: string;
			answer: string;
			typed: boolean;
	  }
	/** A form's answers, one per part, sent together (see `checkFormAnswers`). */
	| { type: "answer-form"; questionId: string; answers: QuestionPartAnswer[] };

/** Ids and clock are injected so the reducer stays pure and testable. */
export interface Env {
	now: () => Date;
	id: () => string;
}

export function reduce(
	state: ChatState,
	action: ChatAction,
	env: Env,
): ChatState {
	switch (action.type) {
		case "send":
			return send(state, action, env);
		// Both are about a send still on the network, so the sync layer's dispatch does them; the reducer has nothing to add.
		case "retry-send":
		case "discard-send":
			return state;
		case "toggle-task":
			return {
				...state,
				tasks: state.tasks.map((t) =>
					t.id === action.taskId
						? { ...t, status: toggledStatus(t.status) }
						: t,
				),
			};
		case "create-app":
			return createApp(state, action, env);
		case "delete-app":
			if (!state.apps.some((a) => a.id === action.appId)) return state;
			return {
				...state,
				apps: state.apps.filter((a) => a.id !== action.appId),
			};
		case "delete-message":
			return withoutMessage(state, action.messageId);
		case "edit-message":
			return withEditedText(state, action.messageId, action.text, env.now());
		case "answer-question":
			return answerQuestion(
				state,
				action.questionId,
				{ answer: action.answer, typed: action.typed },
				env,
			);
		case "answer-form": {
			const parts =
				state.messages.find((m) => m.question?.id === action.questionId)
					?.question?.parts ?? [];
			const answer = formAnswerText(parts, action.answers);
			return answerQuestion(
				state,
				action.questionId,
				{
					answer,
					typed: action.answers.some((a) => a.typed !== null),
					answers: action.answers,
				},
				env,
			);
		}
	}
}

/**
 * The viewer's answer, shown on the card at once: an open question collapses to it; one the Dev gave up on keeps
 * saying so, with the late answer under it. Anything else (answered already, cancelled) is left as it is.
 */
function answerQuestion(
	state: ChatState,
	questionId: string,
	given: { answer: string; typed: boolean; answers?: QuestionPartAnswer[] },
	env: Env,
): ChatState {
	const question = state.messages.find(
		(m) => m.question?.id === questionId,
	)?.question;
	if (
		!question ||
		!(
			question.status === "open" ||
			(question.status === "expired" && question.answer === null)
		)
	)
		return state;
	return withQuestion(state, {
		...question,
		status: question.status === "open" ? "answered" : "expired",
		...given,
		answeredBy: state.meId,
		answeredAt: env.now().toISOString(),
	});
}

function createApp(
	state: ChatState,
	{
		appId,
		chatId,
		name,
		description,
	}: Extract<ChatAction, { type: "create-app" }>,
	env: Env,
): ChatState {
	const trimmed = name.trim();
	const chatExists = state.chats.some((c) => c.id === chatId);
	if (!trimmed || !chatExists || state.apps.some((a) => a.id === appId))
		return state;

	const at = env.now().toISOString();
	const app: App = {
		id: appId,
		chatId,
		name: trimmed,
		description: description.trim(),
		// Cycle the palette so apps created one after another never share a colour.
		color: (state.apps.length % APP_COLOR_COUNT) + 1,
		status: "draft",
		version: null,
		url: null,
		creatorDevId: null,
		// Made on purpose, from a brief: saved from the start.
		saved: true,
		createdAt: at,
	};
	// A system note so the chat's history shows when the sketch arrived, as it will for sketches others add.
	const note: Message = {
		id: env.id(),
		chatId,
		authorId: null,
		text: `You added the sketch ${trimmed}`,
		at,
	};
	return {
		...state,
		apps: [...state.apps, app],
		messages: [...state.messages, note],
	};
}

function send(
	state: ChatState,
	{ chatId, text, replyToId }: Extract<ChatAction, { type: "send" }>,
	env: Env,
): ChatState {
	const trimmed = text.trim();
	const chat = state.chats.find((c) => c.id === chatId);
	if (!trimmed || !chat) return state;

	const now = env.now();
	const original = replyToId
		? state.messages.find((m) => m.id === replyToId && m.chatId === chatId)
		: undefined;
	const message: Message = {
		id: env.id(),
		chatId,
		authorId: state.meId,
		text: trimmed,
		at: now.toISOString(),
		...(original ? { replyTo: replyQuoteOf(state, original) } : {}),
	};
	const draft = parseTaskCommand(trimmed, now);
	if (!draft) return { ...state, messages: [...state.messages, message] };

	const task: Task = {
		id: env.id(),
		chatId,
		title: draft.title,
		description: "",
		status: "todo",
		...resolveTaskAssignee(state, chat, draft.assignee),
		due: draft.due,
		scheduledAt: draft.scheduledAt,
		remind: draft.remind,
		// The server fills in the series; until then the card shows no repeat.
		repeat: null,
		createdAt: now.toISOString(),
	};
	return {
		...state,
		messages: [...state.messages, { ...message, taskId: task.id }],
		tasks: [...state.tasks, task],
	};
}

/**
 * Who a `/task` is for, as the server decides it: `@me` is the sender; a mention token is that Dev or person if
 * they're in the chat; a handle is the first member, else Dev here, whose name starts with it. Without one, a 1:1's
 * task goes to its Dev (asking your Dev for something is the point of the 1:1) and a group's stays unassigned.
 */
export function resolveTaskAssignee(
	state: ChatState,
	chat: Chat,
	handle: string | null,
): Pick<Task, "assigneeId" | "assigneeDevId"> {
	const none = { assigneeId: null, assigneeDevId: null };
	if (!handle)
		return chat.kind === "direct" && chat.devIds[0]
			? { ...none, assigneeDevId: chat.devIds[0] }
			: none;
	if (handle === "me") return { ...none, assigneeId: state.meId };
	const [ref] = parseMentionTokens(handle);
	if (ref) {
		if (ref.kind === "dev")
			return chat.devIds.includes(ref.id)
				? { ...none, assigneeDevId: ref.id }
				: none;
		return chat.memberIds.includes(ref.id)
			? { ...none, assigneeId: ref.id }
			: none;
	}
	const member = chat.memberIds.find((id) =>
		state.members[id]?.name.toLowerCase().startsWith(handle),
	);
	if (member) return { ...none, assigneeId: member };
	const dev = chat.devIds.find((id) =>
		state.devs[id]?.name.toLowerCase().startsWith(handle),
	);
	return dev ? { ...none, assigneeDevId: dev } : none;
}

/**
 * The state without a message, and without the quotes of it (as the server forgets what a reply quoted once the
 * original goes).
 */
export function withoutMessage(state: ChatState, messageId: string): ChatState {
	if (!state.messages.some((m) => m.id === messageId)) return state;
	return {
		...state,
		messages: state.messages.flatMap((m) => {
			if (m.id === messageId) return [];
			if (m.replyTo?.id !== messageId) return [m];
			const { replyTo: _gone, ...rest } = m;
			return [rest];
		}),
	};
}

/** A message's words changed by its author, marked edited, and the quotes of it in its replies with them. */
function withEditedText(
	state: ChatState,
	messageId: string,
	text: string,
	now: Date,
): ChatState {
	const trimmed = text.trim();
	const message = state.messages.find((m) => m.id === messageId);
	if (!message || !trimmed || trimmed === message.text) return state;
	const edited = { ...message, text: trimmed, editedAt: now.toISOString() };
	return withFreshQuotes(
		{
			...state,
			messages: state.messages.map((m) => (m === message ? edited : m)),
		},
		messageId,
	);
}

/**
 * The state with the replies to a message quoting it as it is now (after an edit or a transcription), as the server
 * makes the quote when it next sends them.
 */
export function withFreshQuotes(
	state: ChatState,
	messageId: string,
): ChatState {
	const original = state.messages.find((m) => m.id === messageId);
	if (!original || !state.messages.some((m) => m.replyTo?.id === messageId))
		return state;
	const quote = replyQuoteOf(state, original);
	return {
		...state,
		messages: state.messages.map((m) =>
			m.replyTo?.id === messageId ? { ...m, replyTo: quote } : m,
		),
	};
}

/** Messages of one chat, oldest first. */
export function messagesOf(state: ChatState, chatId: string): Message[] {
	return state.messages.filter((m) => m.chatId === chatId);
}

/** Each chat's newest message, in one pass over the messages (a chat list's "when it last moved"). */
export function lastMessageByChat(
	state: ChatState,
): ReadonlyMap<string, Message> {
	const last = new Map<string, Message>();
	for (const m of state.messages) last.set(m.chatId, m);
	return last;
}

/** Trigger batches of one chat, oldest first: `toThreadItems`' second argument. */
export function triggerBatchesOf(
	state: ChatState,
	chatId: string,
): TriggerBatch[] {
	return (state.triggerBatches ?? []).filter((b) => b.chatId === chatId);
}

/** Tasks of one chat: by status (done last), then due (undated last), then when they were made. */
export function tasksOf(state: ChatState, chatId: string): Task[] {
	return state.tasks.filter((t) => t.chatId === chatId).sort(byUrgency);
}

/**
 * Tasks across every chat that are the user's: assigned to them or to one of their own Devs, plus unassigned ones in
 * their 1:1 with their own Dev (nobody else could do those). Same order as `tasksOf`.
 */
export function myTasks(state: ChatState): Task[] {
	const dev = myDev(state);
	const personal = new Set(
		state.chats
			.filter((c) => c.kind === "direct" && dev && c.devIds.includes(dev.id))
			.map((c) => c.id),
	);
	const mine = (t: Task) =>
		t.assigneeId === state.meId ||
		(t.assigneeDevId !== null &&
			state.devs[t.assigneeDevId]?.ownerId === state.meId) ||
		(t.assigneeId === null &&
			t.assigneeDevId === null &&
			personal.has(t.chatId));
	return state.tasks.filter(mine).sort(byUrgency);
}

/** Work under way first, then the rest; done last. */
const STATUS_ORDER: Record<TaskStatus, number> = {
	in_progress: 0,
	todo: 1,
	done: 2,
};

/** By status, then due (a time sorts within its local day; undated last), then creation. */
function byUrgency(a: Task, b: Task): number {
	// A date-only task sorts before timed ones on the same day; within a day, instants order the same in any zone.
	const when = (t: Task) =>
		t.scheduledAt ? `${taskDate(t)}T${t.scheduledAt}` : (t.due ?? "9999");
	return (
		STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
		when(a).localeCompare(when(b)) ||
		a.createdAt.localeCompare(b.createdAt)
	);
}

/** Every sketch in one chat, saved or not, in the order they were added: what the chat's own list shows. */
export function appsOf(state: ChatState, chatId: string): App[] {
	return state.apps.filter((a) => a.chatId === chatId);
}

/** The saved sketches of one chat, in the order they were added: the chat's tabs. */
export function savedAppsOf(state: ChatState, chatId: string): App[] {
	return appsOf(state, chatId).filter((a) => a.saved);
}

/** Saved sketches in every chat the user is a member of, newest first: the sidebar's Sketches. */
export function myApps(state: ChatState): App[] {
	const mine = new Set(
		state.chats
			.filter((c) => c.memberIds.includes(state.meId))
			.map((c) => c.id),
	);
	return state.apps
		.filter((a) => a.saved && mine.has(a.chatId))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
