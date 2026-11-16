import { describe, expect, test } from "bun:test";
import type { ChatState } from "@superset/chats-core";
import type { SendResult } from "../api-types/api-types.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import { ApiError } from "../http/http.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";
import {
	apiMessage,
	apiQuestion,
	apiTask,
	bootstrap,
	PRIYA,
} from "../test-fixtures/test-fixtures.ts";
import { createChatDispatch } from "./chat-actions.ts";

const NOW = new Date("2026-10-12T09:00:00.000Z");

/** A dispatch over an in-memory state; API calls not stubbed fail like a 500. */
function setup(api: Partial<SyncApi>, boot = bootstrap()) {
	let state: ChatState = fromBootstrap(boot);
	const failures: string[] = [];
	const notices: string[] = [];
	const reject = () => Promise.reject(new ApiError(500, "internal", "boom"));
	const dispatch = createChatDispatch({
		api: new Proxy(api, {
			get: (target, key) => target[key as keyof SyncApi] ?? reject,
		}) as SyncApi,
		getState: () => state,
		update: (change) => (state = change(state)),
		fail: (title) => failures.push(title),
		notify: (title) => notices.push(title),
		now: () => NOW,
		sendRetryDelaysMs: [0, 0],
		retryDelaysMs: [0, 0],
	});
	return { dispatch, failures, notices, state: () => state };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("chat dispatch", () => {
	test("a sent message shows at once and is replaced by the server's copy", async () => {
		let sent: { text: string; clientId: string } | undefined;
		const { dispatch, state } = setup({
			sendMessage: async (_groupId, body): Promise<SendResult> => {
				sent = body;
				return {
					message: apiMessage({
						id: "m-server",
						text: body.text,
						clientId: body.clientId,
						at: NOW.toISOString(),
					}),
					task: null,
				};
			},
		});
		dispatch({ type: "send", chatId: "g-me", text: "  hi  " });
		expect(state().messages.at(-1)).toMatchObject({
			text: "hi",
			authorId: "u1",
		});
		await settle();
		expect(sent?.text).toBe("hi");
		expect(
			state()
				.messages.filter((m) => m.text === "hi")
				.map((m) => m.id),
		).toEqual(["m-server"]);
	});

	test("a reply quotes its original at once and sends its id; a reply to a message still being sent goes plain", async () => {
		const bodies: { replyToId?: string }[] = [];
		const { dispatch, state } = setup({
			sendMessage: async (_groupId, body) => {
				bodies.push(body);
				return {
					message: apiMessage({
						id: `m-${bodies.length}0`,
						text: body.text,
						clientId: body.clientId,
					}),
					task: null,
				};
			},
		});
		dispatch({ type: "send", chatId: "g-me", text: "yes", replyToId: "m2" });
		expect(state().messages.at(-1)!.replyTo).toMatchObject({
			id: "m2",
			text: "hello",
		});
		dispatch({
			type: "send",
			chatId: "g-me",
			text: "and",
			replyToId: "local-123",
		});
		await settle();
		expect(bodies.map((b) => b.replyToId)).toEqual(["m2", undefined]);
	});

	test("a /task sends its parsed draft; one the server refuses stays as Not delivered", async () => {
		let task: unknown;
		const { dispatch, failures, state } = setup({
			sendMessage: async (_groupId, body) => {
				task = body.task;
				throw new ApiError(500, "internal", "boom");
			},
		});
		const before = state().tasks.length;
		dispatch({
			type: "send",
			chatId: "g-me",
			text: "/task Pay rent tomorrow 9am",
		});
		expect(state().tasks).toHaveLength(before + 1);
		await settle();
		expect(task).toMatchObject({
			title: "Pay rent",
			scheduledAt: new Date(
				NOW.getFullYear(),
				NOW.getMonth(),
				NOW.getDate() + 1,
				9,
			).toISOString(),
		});
		const unsent = state().messages.find((m) => m.upload?.error)!;
		expect(state().tasks).toHaveLength(before + 1);
		expect(failures).toEqual([]);
		dispatch({ type: "discard-send", messageId: unsent.id });
		expect(state().tasks).toHaveLength(before);
	});

	test("a send that gets no answer is repeated with its clientId and stays in the thread", async () => {
		const ids: string[] = [];
		const { dispatch, failures, state } = setup({
			sendMessage: async (_groupId, body) => {
				ids.push(body.clientId);
				if (ids.length < 3) throw new TypeError("The request timed out.");
				return {
					message: apiMessage({
						id: "m-server",
						text: body.text,
						clientId: body.clientId,
					}),
					task: null,
				};
			},
		});
		dispatch({ type: "send", chatId: "g-me", text: "hi" });
		await new Promise((r) => setTimeout(r, 20));
		expect(new Set(ids).size).toBe(1);
		expect(ids).toHaveLength(3);
		expect(
			state()
				.messages.filter((m) => m.text === "hi")
				.map((m) => m.id),
		).toEqual(["m-server"]);
		expect(failures).toEqual([]);
	});

	test("a send that never gets through stays as Not delivered, with no alert, and Try again sends it as it was", async () => {
		const ids: string[] = [];
		let up = false;
		const { dispatch, failures, state } = setup({
			sendMessage: async (_groupId, body) => {
				ids.push(body.clientId);
				if (!up) throw new TypeError("The request timed out.");
				return {
					message: apiMessage({
						id: "m-server",
						text: body.text,
						clientId: body.clientId,
					}),
					task: null,
				};
			},
		});
		dispatch({ type: "send", chatId: "g-me", text: "hi" });
		await new Promise((r) => setTimeout(r, 20));
		const stuck = state().messages.find((m) => m.text === "hi")!;
		expect(stuck.upload?.error).toBeTruthy();
		expect(failures).toEqual([]);
		up = true;
		dispatch({ type: "retry-send", messageId: stuck.id });
		expect(
			state().messages.find((m) => m.id === stuck.id)?.upload,
		).toBeUndefined();
		await new Promise((r) => setTimeout(r, 20));
		expect(new Set(ids)).toEqual(new Set([stuck.id]));
		expect(
			state()
				.messages.filter((m) => m.text === "hi")
				.map((m) => m.id),
		).toEqual(["m-server"]);
	});

	test("Delete drops a message that wasn't delivered", async () => {
		const { dispatch, state } = setup({
			sendMessage: async () => Promise.reject(new TypeError("offline")),
		});
		dispatch({ type: "send", chatId: "g-me", text: "hi" });
		await new Promise((r) => setTimeout(r, 20));
		dispatch({
			type: "discard-send",
			messageId: state().messages.find((m) => m.text === "hi")!.id,
		});
		expect(state().messages.some((m) => m.text === "hi")).toBe(false);
	});

	test("a tick, a delete and an edit repeat quietly when the connection drops, with no alert", async () => {
		const calls = { update: 0, del: 0, edit: 0 };
		const flaky =
			<T>(key: keyof typeof calls, ok: T) =>
			async () => {
				if (++calls[key] < 3) throw new TypeError("The request timed out.");
				return ok;
			};
		const { dispatch, failures, state } = setup({
			updateTask: flaky("update", apiTask({ id: "t1", status: "done" })),
			deleteMessage: flaky("del", undefined as never),
			editMessage: flaky("edit", {
				message: apiMessage({ id: "m1", text: "changed" }),
			}),
		});
		dispatch({ type: "toggle-task", taskId: "t1" });
		dispatch({ type: "delete-message", messageId: "m2" });
		await new Promise((r) => setTimeout(r, 20));
		expect(calls).toMatchObject({ update: 3, del: 3 });
		expect(state().tasks.find((t) => t.id === "t1")?.status).toBe("done");
		expect(state().messages.some((m) => m.id === "m2")).toBe(false);
		expect(failures).toEqual([]);
	});

	test("a change that never gets through is put back with the usual alert", async () => {
		const { dispatch, failures, state } = setup({
			updateTask: async () => Promise.reject(new TypeError("offline")),
		});
		dispatch({ type: "toggle-task", taskId: "t1" });
		await new Promise((r) => setTimeout(r, 20));
		expect(state().tasks.find((t) => t.id === "t1")?.status).toBe("todo");
		expect(failures).toEqual(["Couldn't update the task"]);
	});

	test("an answer repeated after a lost reply, met by 'already answered', raises no alert", async () => {
		const question = apiQuestion({ status: "open" });
		let calls = 0;
		const { dispatch, failures } = setup(
			{
				answerQuestion: async () => {
					if (++calls === 1) throw new TypeError("timed out");
					throw new ApiError(
						409,
						"already_answered",
						"This question was already answered",
					);
				},
			},
			bootstrap({
				messages: [
					apiMessage({
						id: "mq",
						authorId: null,
						authorDevId: "m-me",
						text: "Pick",
						question,
					}),
				],
			}),
		);
		dispatch({
			type: "answer-question",
			questionId: question.id,
			answer: "Thai",
			typed: false,
		});
		await new Promise((r) => setTimeout(r, 20));
		expect(calls).toBe(2);
		expect(failures).toEqual([]);
	});

	test("an ambiguous mention is a notice, not a failure", async () => {
		const { dispatch, notices, failures } = setup({
			sendMessage: async (_groupId, body) => ({
				message: apiMessage({ id: "m9", clientId: body.clientId }),
				task: null,
				ambiguousMentions: ["Juniper"],
			}),
		});
		dispatch({ type: "send", chatId: "g-me", text: "@Juniper hi" });
		await settle();
		expect(notices).toEqual(["Several Devs are called Juniper — pick one"]);
		expect(failures).toEqual([]);
	});

	test("ticking a task is optimistic and rolls back on failure", async () => {
		const { dispatch, failures, state } = setup({});
		dispatch({ type: "toggle-task", taskId: "t1" });
		expect(state().tasks.find((t) => t.id === "t1")?.status).toBe("done");
		await settle();
		expect(state().tasks.find((t) => t.id === "t1")?.status).toBe("todo");
		expect(failures).toEqual(["Couldn't update the task"]);
	});

	test("a ticked task takes the server's copy", async () => {
		const { dispatch, state } = setup({
			updateTask: async (id, patch) =>
				apiTask({ id, status: patch.status, title: "Pay rent (paid)" }),
		});
		dispatch({ type: "toggle-task", taskId: "t1" });
		await settle();
		expect(state().tasks.find((t) => t.id === "t1")).toMatchObject({
			status: "done",
			title: "Pay rent (paid)",
		});
	});

	test("a failed app creation rolls back", async () => {
		const { dispatch, failures, state } = setup({});
		dispatch({
			type: "create-app",
			appId: "a1",
			chatId: "g-me",
			name: "Budget",
			description: "",
		});
		expect(state().apps.map((a) => a.id)).toEqual(["a1"]);
		await settle();
		expect(state().apps).toEqual([]);
		expect(failures).toEqual(["Couldn't create the sketch"]);
	});

	test("deleting a message removes only it at once, and puts it back in place if the server refuses", async () => {
		let deleted: string | undefined;
		const ok = setup({
			deleteMessage: async (id) => {
				deleted = id;
			},
		});
		ok.dispatch({ type: "delete-message", messageId: "m1" });
		expect(ok.state().messages.map((m) => m.id)).toEqual(["m2"]);
		expect(ok.state().tasks.map((t) => t.id)).toEqual(["t1"]);
		await settle();
		expect(deleted).toBe("m1");

		const refused = setup({});
		refused.dispatch({ type: "delete-message", messageId: "m1" });
		await settle();
		expect(refused.state().messages.map((m) => m.id)).toEqual(["m1", "m2"]);
		expect(refused.failures).toEqual(["Couldn't delete the message"]);
	});

	test("editing a message shows the new words at once, takes the server's copy, and puts the old words back if refused", async () => {
		let edited: string | undefined;
		const ok = setup({
			editMessage: async (id, text) => {
				edited = `${id}:${text}`;
				return {
					message: apiMessage({
						id,
						text,
						at: "2026-10-10T09:05:00.000Z",
						editedAt: "2026-10-12T09:00:01.000Z",
					}),
				};
			},
		});
		ok.dispatch({
			type: "edit-message",
			messageId: "m2",
			text: " hello there ",
		});
		expect(ok.state().messages.find((m) => m.id === "m2")).toMatchObject({
			text: "hello there",
			editedAt: NOW.toISOString(),
		});
		await settle();
		expect(edited).toBe("m2:hello there");
		expect(ok.state().messages.find((m) => m.id === "m2")?.editedAt).toBe(
			"2026-10-12T09:00:01.000Z",
		);

		const refused = setup({});
		refused.dispatch({
			type: "edit-message",
			messageId: "m2",
			text: "hello there",
		});
		await settle();
		expect(refused.state().messages.find((m) => m.id === "m2")).toMatchObject({
			text: "hello",
		});
		expect(
			refused.state().messages.find((m) => m.id === "m2"),
		).not.toHaveProperty("editedAt");
		expect(refused.failures).toEqual(["Couldn't edit your message"]);
	});

	test("a card's message isn't edited, and asks nothing of the server", async () => {
		let called = false;
		const { dispatch, state } = setup({
			editMessage: async () => {
				called = true;
				return { message: apiMessage() };
			},
		});
		dispatch({
			type: "edit-message",
			messageId: "m1",
			text: "/task Pay the rent",
		});
		await settle();
		expect(called).toBe(false);
		expect(state().messages.find((m) => m.id === "m1")?.text).toBe(
			"/task Pay rent",
		);
	});

	test("a message this person may not delete is left alone, without a request", async () => {
		let called = false;
		// Priya's message in a group I'm only a member of.
		const bootstrapped = bootstrap({
			groups: [
				{
					id: "g-trip",
					kind: "group",
					title: "Trip",
					members: [
						{ ...PRIYA, role: "owner" },
						{
							id: "u1",
							email: "",
							name: null,
							displayName: "harshith",
							role: "member",
						},
					],
				},
			],
			messages: [
				apiMessage({ id: "m-p", groupId: "g-trip", authorId: PRIYA.id }),
			],
		});
		let state: ChatState = fromBootstrap(bootstrapped);
		const dispatch = createChatDispatch({
			api: {
				deleteMessage: async () => {
					called = true;
				},
			} as unknown as SyncApi,
			getState: () => state,
			update: (change) => (state = change(state)),
			fail: () => {},
			notify: () => {},
		});
		dispatch({ type: "delete-message", messageId: "m-p" });
		await settle();
		expect(called).toBe(false);
		expect(state.messages.map((m) => m.id)).toEqual(["m-p"]);
	});

	test("deleting an app someone else already deleted is not an error", async () => {
		const app = {
			id: "a1",
			groupId: "g-me",
			name: "Budget",
			description: "",
			color: 1,
			status: "draft" as const,
			version: null,
			url: null,
			createdByDevId: null,
			saved: true,
			createdAt: NOW.toISOString(),
		};
		let state: ChatState = fromBootstrap(bootstrap({ apps: [app] }));
		const failures: string[] = [];
		const dispatch = createChatDispatch({
			api: {
				deleteApp: () => Promise.reject(new ApiError(404, "not_found", "gone")),
			} as unknown as SyncApi,
			getState: () => state,
			update: (change) => (state = change(state)),
			fail: (title) => failures.push(title),
			notify: () => {},
		});
		dispatch({ type: "delete-app", appId: "a1" });
		await settle();
		expect(state.apps).toEqual([]);
		expect(failures).toEqual([]);
	});

	test("an answer shows on the card at once and takes the server's copy; a refused one rolls back", async () => {
		const asked = bootstrap({
			messages: [
				apiMessage({
					id: "mq",
					authorId: null,
					authorDevId: "m-me",
					text: "Which cuisine?",
					question: apiQuestion(),
				}),
			],
		});
		const sent: unknown[] = [];
		const ok = setup(
			{
				answerQuestion: async (questionId, body) => {
					sent.push({ questionId, ...body });
					return {
						question: apiQuestion({
							status: "answered",
							answer: "Thai",
							answeredBy: "u1",
							answeredAt: "2026-10-12T09:00:01.000Z",
						}),
					};
				},
			},
			asked,
		);
		ok.dispatch({
			type: "answer-question",
			questionId: "q1",
			answer: "Thai",
			typed: false,
		});
		expect(ok.state().messages[0]!.question).toMatchObject({
			status: "answered",
			answer: "Thai",
			answeredAt: NOW.toISOString(),
		});
		await settle();
		expect(sent).toEqual([{ questionId: "q1", answer: "Thai", typed: false }]);
		expect(ok.state().messages[0]!.question?.answeredAt).toBe(
			"2026-10-12T09:00:01.000Z",
		);

		const refused = setup(
			{
				answerQuestion: () =>
					Promise.reject(
						new ApiError(
							409,
							"already_answered",
							"This question was already answered",
						),
					),
			},
			asked,
		);
		refused.dispatch({
			type: "answer-question",
			questionId: "q1",
			answer: "Italian",
			typed: false,
		});
		await settle();
		expect(refused.state().messages[0]!.question?.status).toBe("open");
		expect(refused.failures).toEqual(["Couldn't send your answer"]);
	});

	test("a form's answers go together and show on the card at once", async () => {
		const parts = [
			{
				header: "Food",
				title: "Which cuisine?",
				options: [{ label: "Thai" }],
				allowOther: true,
				multiSelect: false,
			},
			{
				header: "Days",
				title: "Which days?",
				options: [{ label: "Mon" }, { label: "Wed" }],
				allowOther: false,
				multiSelect: true,
			},
		];
		const form = apiQuestion({
			kind: "form",
			title: "Food · Days",
			options: [],
			parts,
			answers: null,
		});
		const sent: unknown[] = [];
		const { dispatch, state } = setup(
			{
				answerQuestion: async (questionId, body) => {
					sent.push({ questionId, ...body });
					return new Promise(() => {});
				},
			},
			bootstrap({
				messages: [
					apiMessage({
						id: "mq",
						authorId: null,
						authorDevId: "m-me",
						text: "Food · Days",
						question: form,
					}),
				],
			}),
		);
		const answers = [
			{ picked: ["Thai"], typed: null },
			{ picked: ["Mon", "Wed"], typed: null },
		];
		dispatch({ type: "answer-form", questionId: "q1", answers });
		expect(state().messages[0]!.question).toMatchObject({
			status: "answered",
			answers,
			answer: "Food: Thai\nDays: Mon, Wed",
		});
		await settle();
		expect(sent).toEqual([{ questionId: "q1", answers }]);
	});
});
