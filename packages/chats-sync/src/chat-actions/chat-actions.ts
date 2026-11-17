import {
	type ChatAction,
	type ChatState,
	canDeleteMessage,
	canEditMessage,
	parseTaskCommand,
	reduce,
	toggledStatus,
	withFreshQuotes,
	withQuestion,
} from "@superset/chats-core";
import { ambiguityHint } from "../ambiguity-hint/ambiguity-hint.ts";
import type { SendResult } from "../api-types/api-types.ts";
import {
	applyCreatedApp,
	applyEvent,
	applySentMessage,
} from "../apply-event/apply-event.ts";
import { uploadError } from "../file-sends/file-sends.ts";
import { ApiError, retryOnNetworkError } from "../http/http.ts";
import {
	createAppOptimistic,
	isLocalId,
	newClientId,
	restoreApp,
	restoreMessage,
	rollbackCreateApp,
	rollbackSend,
	sendOptimistic,
	setSendFailed,
	setTaskFields,
} from "../optimistic/optimistic.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";

export type ChatDispatch = (action: ChatAction) => void;

interface Deps {
	api: Pick<
		SyncApi,
		| "sendMessage"
		| "updateTask"
		| "createApp"
		| "deleteApp"
		| "deleteMessage"
		| "editMessage"
		| "answerQuestion"
	>;
	getState: () => ChatState | null;
	update: (change: (s: ChatState) => ChatState) => void;
	/** Shows an error (or signs out on 401). */
	fail: (title: string, err: unknown) => void;
	/** Shows a non-error notice, e.g. that a mention woke nobody. */
	notify: (title: string, description: string) => void;
	now?: () => Date;
	/** Waits before each repeat of a send that never reached the server; its length is the number of repeats. */
	sendRetryDelaysMs?: number[];
	/** The same for small changes (a tick, an edit, a delete, an answer). */
	retryDelaysMs?: number[];
}

/** About a minute of quiet repeats (plus each attempt's own timeout) before a message is marked "Not delivered". */
const SEND_RETRY_DELAYS_MS = [1_000, 3_000, 8_000, 15_000, 30_000];

/**
 * Messages, tasks and apps: each action shows at once and is reconciled with the server's answer, rolling back with an
 * error on failure. The server's copy replaces the optimistic one by clientId, whichever of the response and the
 * realtime event lands first.
 */
export function createChatDispatch({
	api,
	getState,
	update,
	fail,
	notify,
	now = () => new Date(),
	sendRetryDelaysMs = SEND_RETRY_DELAYS_MS,
	retryDelaysMs,
}: Deps): ChatDispatch {
	/** Sends that gave up, kept so Try again can send them as they were. */
	const unsent = new Map<string, () => void>();

	/**
	 * Sends as WhatsApp does: the message is in the thread already and the connection is retried quietly. If it still
	 * can't get through it stays there as "Not delivered" to try again or delete, never an alert or a vanished message.
	 */
	function sendText(clientId: string, send: () => Promise<SendResult>) {
		retryOnNetworkError(send, sendRetryDelaysMs)
			.then((sent) => {
				unsent.delete(clientId);
				update((s) => applySentMessage(s, sent));
				const hint = ambiguityHint(sent.ambiguousMentions ?? []);
				if (hint)
					notify(hint, "Nobody was woken. Type @ and choose who you mean.");
			})
			.catch((err: unknown) => {
				unsent.set(clientId, () => {
					update((s) => setSendFailed(s, clientId, null));
					sendText(clientId, send);
				});
				update((s) => setSendFailed(s, clientId, uploadError(err)));
				// Signed out: the one failure with something to do besides retrying.
				if (err instanceof ApiError && err.status === 401)
					fail("Couldn't send your message", err);
			});
	}

	return (action) => {
		const current = getState();
		if (!current) return;
		switch (action.type) {
			case "send": {
				const text = action.text.trim();
				if (!text) return;
				const clientId = newClientId();
				const at = now();
				const task = parseTaskCommand(text, at) ?? undefined;
				// A reply to a message still being sent has no server id to quote yet, and a `/task` is a card: either goes
				// without a quote.
				const replyToId =
					action.replyToId && !isLocalId(action.replyToId) && !task
						? action.replyToId
						: undefined;
				update((s) =>
					sendOptimistic(s, {
						chatId: action.chatId,
						text,
						replyToId,
						clientId,
						now: at,
					}),
				);
				sendText(clientId, () =>
					api.sendMessage(action.chatId, {
						text,
						clientId,
						task,
						...(replyToId ? { replyToId } : {}),
					}),
				);
				return;
			}
			case "retry-send":
				unsent.get(action.messageId)?.();
				return;
			case "discard-send":
				unsent.delete(action.messageId);
				update((s) => rollbackSend(s, action.messageId));
				return;
			case "toggle-task": {
				const task = current.tasks.find((t) => t.id === action.taskId);
				// A task that's still being created has no server id to update yet.
				if (!task || isLocalId(task.id)) return;
				const status = toggledStatus(task.status);
				update((s) => setTaskFields(s, task.id, { status }));
				retryOnNetworkError(
					() => api.updateTask(task.id, { status }),
					retryDelaysMs,
				)
					.then((synced) =>
						update((s) =>
							applyEvent(s, { type: "task.updated", task: synced }),
						),
					)
					.catch((err: unknown) => {
						update((s) => setTaskFields(s, task.id, { status: task.status }));
						fail("Couldn't update the task", err);
					});
				return;
			}
			case "create-app": {
				const input = { ...action, now: now() };
				const app = createAppOptimistic(current, input).apps.find(
					(a) => a.id === action.appId,
				);
				if (!app) return;
				update((s) => createAppOptimistic(s, input));
				retryOnNetworkError(
					() =>
						api.createApp(action.chatId, {
							id: app.id,
							name: app.name,
							description: app.description,
							color: app.color,
						}),
					retryDelaysMs,
				)
					.then((created) => update((s) => applyCreatedApp(s, created)))
					.catch((err: unknown) => {
						update((s) => rollbackCreateApp(s, app.id));
						fail("Couldn't create the sketch", err);
					});
				return;
			}
			case "delete-app": {
				const app = current.apps.find((a) => a.id === action.appId);
				if (!app) return;
				update((s) => reduce(s, action, { now, id: newClientId }));
				retryOnNetworkError(() => api.deleteApp(app.id), retryDelaysMs).catch(
					(err: unknown) => {
						// Someone else deleted it first: the outcome the user wanted.
						if (err instanceof ApiError && err.status === 404) return;
						update((s) => restoreApp(s, app));
						fail("Couldn't delete the sketch", err);
					},
				);
				return;
			}
			case "delete-message": {
				const message = current.messages.find((m) => m.id === action.messageId);
				if (!message || !canDeleteMessage(current, message)) return;
				update((s) => reduce(s, action, { now, id: newClientId }));
				retryOnNetworkError(
					() => api.deleteMessage(message.id),
					retryDelaysMs,
				).catch((err: unknown) => {
					if (err instanceof ApiError && err.status === 404) return;
					update((s) => restoreMessage(s, message));
					fail("Couldn't delete the message", err);
				});
				return;
			}
			case "edit-message": {
				const before = current.messages.find((m) => m.id === action.messageId);
				const text = action.text.trim();
				if (
					!before ||
					!canEditMessage(current, before) ||
					!text ||
					text === before.text
				)
					return;
				update((s) => reduce(s, action, { now, id: newClientId }));
				retryOnNetworkError(
					() => api.editMessage(before.id, text),
					retryDelaysMs,
				)
					.then(({ message }) =>
						update((s) => applyEvent(s, { type: "message.updated", message })),
					)
					.catch((err: unknown) => {
						if (err instanceof ApiError && err.status === 404) return;
						// Put the words back, unless someone's later change has already replaced ours.
						update((s) =>
							s.messages.find((m) => m.id === before.id)?.text === text
								? withFreshQuotes(
										{
											...s,
											messages: s.messages.map((m) =>
												m.id === before.id ? before : m,
											),
										},
										before.id,
									)
								: s,
						);
						fail("Couldn't edit your message", err);
					});
				return;
			}
			case "answer-question":
			case "answer-form": {
				const before = current.messages.find(
					(m) => m.question?.id === action.questionId,
				)?.question;
				if (!before) return;
				update((s) => reduce(s, action, { now, id: newClientId }));
				let tries = 0;
				const body =
					action.type === "answer-form"
						? { answers: action.answers }
						: { answer: action.answer, typed: action.typed };
				retryOnNetworkError(
					() => (tries++, api.answerQuestion(action.questionId, body)),
					retryDelaysMs,
				)
					.then(({ question }) => update((s) => withQuestion(s, question)))
					.catch((err: unknown) => {
						// A repeat after a lost reply can meet our own first answer: the realtime event then has the card's truth.
						if (
							tries > 1 &&
							err instanceof ApiError &&
							err.code === "already_answered"
						)
							return;
						update((s) => withQuestion(s, before));
						fail("Couldn't send your answer", err);
					});
				return;
			}
		}
	};
}
