import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
	createChatUi,
	describeSelect,
	type QuestionApi,
	type QuestionCard,
	type QuestionStatus,
} from "./chat-ui.ts";

/**
 * An API whose polls answer from a script, one per poll; `open` until the script runs out (the poll then hangs until
 * aborted). `release` answers what the API would once the turn lets go.
 */
function fakeApi(
	script: (QuestionStatus | Error)[] = [],
	release: QuestionStatus = { status: "open" },
) {
	const asked: QuestionCard[] = [];
	const cancelled: string[] = [];
	const released: string[] = [];
	const clock = { now: 0 };
	const notes: string[] = [];
	let polls = 0;
	const api: QuestionApi = {
		ask: async (card) => {
			asked.push(card);
			return { id: `q${asked.length}` };
		},
		wait: (_id, signal) => {
			polls++;
			const next = script.shift();
			if (next instanceof Error) return Promise.reject(next);
			if (next) return Promise.resolve(next);
			// Still open: the poll hangs like the API's until the dialog is aborted.
			return new Promise((_, reject) =>
				signal.addEventListener("abort", () => reject(new Error("aborted"))),
			);
		},
		release: async (id) => {
			released.push(id);
			return release;
		},
		cancel: async (id) => void cancelled.push(id),
		notify: async (text) => void notes.push(text),
	};
	return { api, asked, cancelled, released, notes, clock, polls: () => polls };
}

function chatUi(
	fake: ReturnType<typeof fakeApi>,
	turn = new AbortController(),
) {
	const updates: SessionUpdate[] = [];
	const ui = createChatUi({
		api: fake.api,
		turnSignal: () => turn.signal,
		onUpdate: (u) => updates.push(u),
		now: () => fake.clock.now,
		sleep: async () => {},
	});
	return { ui, updates, turn };
}

/** Every poll comes back `open` after the API's 25 s, on the fake clock. */
function stillOpen(fake: ReturnType<typeof fakeApi>) {
	fake.api.wait = async () => {
		fake.clock.now += 25_000;
		return { status: "open" };
	};
}

describe("chat extension UI", () => {
	test("select becomes a card with its options and descriptions, and returns the pick", async () => {
		const fake = fakeApi([
			{ status: "open" },
			{ status: "answered", answer: "Thai", typed: false },
		]);
		const { ui, updates } = chatUi(fake);
		const options = describeSelect(["Italian", "Thai"], {
			descriptions: [undefined, "Spicy"],
			answerer: "bob",
		});
		expect(await ui.select("Which cuisine?", options)).toBe("Thai");
		expect(fake.asked).toEqual([
			{
				kind: "select",
				title: "Which cuisine?",
				options: [
					{ label: "Italian" },
					{ label: "Thai", description: "Spicy" },
				],
				allowOther: false,
				answerer: "bob",
			},
		]);
		expect(fake.polls()).toBe(2);
		expect(
			updates.map((u) => [u.sessionUpdate, "status" in u ? u.status : null]),
		).toEqual([
			["tool_call", "pending"],
			["tool_call_update", "completed"],
		]);
	});

	test("Other…: the typed answer comes back from the input that follows, without a second card", async () => {
		const fake = fakeApi([
			{ status: "answered", answer: "Somewhere quiet", typed: true },
		]);
		const { ui } = chatUi(fake);
		const options = describeSelect(["Italian", "Other…"], { other: "Other…" });
		expect(await ui.select("Where?", options)).toBe("Other…");
		expect(fake.asked[0]).toMatchObject({
			options: [{ label: "Italian" }],
			allowOther: true,
		});
		expect(await ui.input("Where?", "Your answer")).toBe("Somewhere quiet");
		expect(fake.asked).toHaveLength(1);
	});

	test("confirm is yes or no; input takes text; a plain select (another extension's) works too", async () => {
		const fake = fakeApi([
			{ status: "answered", answer: "yes", typed: false },
			{ status: "answered", answer: "Peanuts", typed: true },
			{ status: "answered", answer: "Block", typed: false },
		]);
		const { ui } = chatUi(fake);
		expect(await ui.confirm("Book for 8pm?", "Two tables left")).toBe(true);
		expect(await ui.input("Any allergies?", "e.g. nuts")).toBe("Peanuts");
		expect(
			await ui.select("Allow rm -rf?", ["Allow", "Block"], { timeout: 5_000 }),
		).toBe("Block");
		expect(fake.asked).toEqual([
			{ kind: "confirm", title: "Book for 8pm?", body: "Two tables left" },
			{ kind: "input", title: "Any allergies?", placeholder: "e.g. nuts" },
			{
				kind: "select",
				title: "Allow rm -rf?",
				options: [{ label: "Allow" }, { label: "Block" }],
				allowOther: false,
				timeoutMs: 5_000,
			},
		]);
	});

	test("nobody answered in time: the dialog is dismissed", async () => {
		const fake = fakeApi([{ status: "expired" }, { status: "expired" }]);
		const { ui, updates } = chatUi(fake);
		expect(await ui.select("Which cuisine?", ["Italian"])).toBeUndefined();
		expect(await ui.confirm("Book?", "")).toBe(false);
		expect(updates.at(-1)).toMatchObject({
			status: "failed",
			content: [{ content: { text: "No answer in time" } }],
		});
	});

	test("no answer within about a minute: the turn lets go and the dialog is dismissed; the card stays open", async () => {
		const fake = fakeApi([], { status: "open" });
		stillOpen(fake);
		const { ui, updates } = chatUi(fake);
		expect(await ui.select("Which cuisine?", ["Italian"])).toBeUndefined();
		expect(fake.clock.now).toBe(75_000);
		expect(fake.released).toEqual(["q1"]);
		expect(fake.cancelled).toEqual([]);
		expect(updates.at(-1)).toMatchObject({
			status: "failed",
			content: [
				{ content: { text: "No answer yet; it will come in a new turn" } },
			],
		});
	});

	test("an answer that beats the release is the turn's after all", async () => {
		const fake = fakeApi([], {
			status: "answered",
			answer: "yes",
			typed: false,
		});
		stillOpen(fake);
		const { ui } = chatUi(fake);
		expect(await ui.confirm("Book?", "")).toBe(true);
	});

	test("cancelling the turn stops the wait and cancels the card; an aborted signal never posts one", async () => {
		const fake = fakeApi();
		const { ui, turn } = chatUi(fake);
		const pending = ui.select("Which cuisine?", ["Italian"]);
		await new Promise((r) => setTimeout(r, 0));
		turn.abort();
		expect(await pending).toBeUndefined();
		expect(fake.cancelled).toEqual(["q1"]);
		expect(await ui.input("Anything else?")).toBeUndefined();
		expect(fake.asked).toHaveLength(1);
	});

	test("the caller's own signal dismisses its dialog alone", async () => {
		const fake = fakeApi();
		const { ui } = chatUi(fake);
		const dialog = new AbortController();
		const pending = ui.confirm("Book?", "", { signal: dialog.signal });
		await new Promise((r) => setTimeout(r, 0));
		dialog.abort();
		expect(await pending).toBe(false);
		expect(fake.cancelled).toEqual(["q1"]);
	});

	test("a dropped poll is asked again; a refused one (the turn ended) gives up", async () => {
		const refused = Object.assign(new Error("no turn"), { status: 403 });
		const fake = fakeApi([
			new Error("socket hang up"),
			{ status: "answered", answer: "Italian", typed: false },
			refused,
		]);
		const { ui } = chatUi(fake);
		expect(await ui.select("Which cuisine?", ["Italian"])).toBe("Italian");
		expect(await ui.select("And dessert?", ["Gelato"])).toBeUndefined();
	});

	test("notify posts a note; terminal-only methods fail clearly", async () => {
		const fake = fakeApi();
		const { ui } = chatUi(fake);
		ui.notify("Couldn't reach the booking site", "warning");
		await new Promise((r) => setTimeout(r, 0));
		expect(fake.notes).toEqual(["Couldn't reach the booking site"]);
		expect(() =>
			ui.custom(() => ({ render: () => [], invalidate() {} })),
		).toThrow(/terminal/);
		expect(() => ui.editor("Edit", "")).toThrow(/terminal/);
		ui.setStatus("x", "y");
	});
});
