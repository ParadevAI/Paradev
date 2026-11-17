import { describe, expect, test } from "bun:test";
import {
	type ChatState,
	FILE_PART_BYTES,
	type SharedFile,
	toThreadItems,
} from "@superset/chats-core";
import { applyEvent } from "../apply-event/apply-event.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import { ApiError } from "../http/http.ts";
import { apiMessage, bootstrap } from "../test-fixtures/test-fixtures.ts";
import {
	createFileSends,
	type FileSend,
	uploadError,
	uploadFraction,
} from "./file-sends.ts";

const NOW = new Date("2026-10-12T09:00:00.000Z");
const settle = () => new Promise((r) => setTimeout(r, 0));

/** The server's copy of what was sent: its own ids, the device's clientId. */
const serverFile = (body: { name: string; size: number }): SharedFile => ({
	id: "f-server",
	chatId: "g-me",
	name: body.name,
	title: "",
	mime: "image/png",
	size: body.size,
	sharedBy: { kind: "user", id: "u1" },
	preview: "",
	createdAt: NOW.toISOString(),
});

/** A file-send controller over an in-memory state; `parts` holds each part's resolver, so a test steps the upload. */
function setup(opts: { failFinish?: unknown } = {}) {
	let state: ChatState = fromBootstrap(bootstrap());
	const parts: (() => void)[] = [];
	const finishes: Record<string, unknown>[] = [];
	let failFinish = opts.failFinish;
	const api = {
		beginFileUpload: async (_g: string, body: { size: number }) => ({
			uploadId: "u",
			partBytes: FILE_PART_BYTES,
			parts: Math.ceil(body.size / FILE_PART_BYTES),
		}),
		putFilePart: () => new Promise<void>((resolve) => parts.push(resolve)),
		finishFileUpload: async (
			_g: string,
			body: {
				name: string;
				size: number;
				clientId?: string;
				message?: string;
				voice?: { durationMs: number; waveform: number[]; text?: string };
			},
		) => {
			finishes.push(body);
			if (failFinish) {
				const err = failFinish;
				failFinish = undefined;
				throw err;
			}
			const clientId = body.clientId!;
			const voice = body.voice
				? {
						voice: {
							durationMs: body.voice.durationMs,
							waveform: body.voice.waveform,
							status: body.voice.text
								? ("done" as const)
								: ("transcribing" as const),
						},
					}
				: {};
			return {
				file: serverFile(body),
				message: {
					...apiMessage({
						id: "m-server",
						clientId,
						text: body.voice?.text ?? body.message ?? "",
						at: "2026-10-12T09:00:01.000Z",
					}),
					file: serverFile(body),
					...voice,
				},
			};
		},
	};
	const sends = createFileSends({
		api,
		update: (change) => (state = change(state)),
		now: () => NOW,
	});
	return { sends, parts, finishes, state: () => state };
}

const picture = (overrides: Partial<FileSend> = {}): FileSend => ({
	chatId: "g-me",
	name: "beach.png",
	size: FILE_PART_BYTES + 10,
	caption: "look",
	localUri: "blob:local-beach",
	read: async () => ({
		sha256: "ab".repeat(32),
		readPart: async (_i, start, end) => new Uint8Array(end - start),
	}),
	...overrides,
});

/** Lets the upload's current part land. */
async function landPart(parts: (() => void)[]) {
	await settle();
	parts.shift()!();
	await settle();
}

describe("sending a file", () => {
	test("its card shows at once with its picture and caption, and fills as each part goes up", async () => {
		const { sends, parts, state } = setup();
		const clientId = sends.send(picture());
		const pending = state().messages.at(-1)!;
		expect(pending).toMatchObject({
			id: clientId,
			authorId: "u1",
			text: "look",
			localUri: "blob:local-beach",
			file: {
				id: clientId,
				name: "beach.png",
				mime: "image/png",
				size: FILE_PART_BYTES + 10,
			},
			upload: { sent: 0, total: FILE_PART_BYTES + 10 },
		});
		await landPart(parts);
		expect(state().messages.at(-1)!.upload).toEqual({
			sent: FILE_PART_BYTES,
			total: FILE_PART_BYTES + 10,
		});
	});

	test("the server's copy takes its place in the same row, keeping the device's picture", async () => {
		const { sends, parts, finishes, state } = setup();
		const clientId = sends.send(picture());
		const rowKey = () =>
			toThreadItems(state().messages.filter((m) => m.chatId === "g-me"))
				.flatMap((i) => (i.kind === "message" ? [i.key] : []))
				.at(-1);
		const before = rowKey();
		await landPart(parts);
		await landPart(parts);
		expect(finishes[0]).toMatchObject({ clientId, message: "look" });
		const confirmed = state().messages.at(-1)!;
		expect(confirmed).toMatchObject({
			id: "m-server",
			clientId,
			localUri: "blob:local-beach",
		});
		expect(confirmed.upload).toBeUndefined();
		expect(state().messages.filter((m) => m.file)).toHaveLength(1);
		expect(rowKey()).toBe(before!);
		// The realtime copy arriving after the response keeps the picture too.
		const again = applyEvent(state(), {
			type: "message.created",
			message: {
				...apiMessage({ id: "m-server", clientId, text: "look" }),
				file: confirmed.file,
			},
			task: null,
		} as never);
		expect(again.messages.find((m) => m.id === "m-server")!.localUri).toBe(
			"blob:local-beach",
		);
	});

	test("a failure stays in the thread with its reason; a retry sends it again under the same clientId", async () => {
		const { sends, parts, finishes, state } = setup({
			failFinish: new ApiError(
				400,
				"bad_file",
				"That file isn't what its name says.",
			),
		});
		const clientId = sends.send(picture({ size: 10 }));
		await landPart(parts);
		expect(state().messages.at(-1)).toMatchObject({
			id: clientId,
			upload: { sent: 0, error: "That file isn't what its name says." },
		});

		sends.retry(clientId);
		expect(state().messages.at(-1)!.upload).toEqual({ sent: 0, total: 10 });
		await landPart(parts);
		expect(finishes.map((f) => f.clientId)).toEqual([clientId, clientId]);
		expect(state().messages.at(-1)).toMatchObject({ id: "m-server", clientId });
	});

	test("a failed one can be dropped, and says so to its owner", async () => {
		const { sends, state } = setup();
		const start = state();
		let done = 0;
		const clientId = sends.send(
			picture({
				read: async () => Promise.reject(new Error("gone")),
				onDone: () => done++,
			}),
		);
		await settle();
		expect(state().messages.at(-1)!.upload?.error).toBe(
			"Couldn't send. Check your connection and try again.",
		);
		sends.discard(clientId);
		expect(state().messages).toEqual(start.messages);
		expect(done).toBe(1);
	});

	test("one still going up can't be dropped or sent twice", async () => {
		const { sends, parts, finishes, state } = setup();
		const clientId = sends.send(picture({ size: 10 }));
		sends.discard(clientId);
		sends.retry(clientId);
		expect(state().messages.at(-1)!.id).toBe(clientId);
		await landPart(parts);
		expect(finishes).toHaveLength(1);
	});
});

describe("sending several", () => {
	const small = (name: string, chatId = "g-me") =>
		picture({ name, chatId, size: 10, caption: undefined });
	const names = (t: { finishes: Record<string, unknown>[] }) =>
		t.finishes.map((f) => f.name);

	test("every card shows at once, but they go up one at a time, in the order sent", async () => {
		const t = setup();
		t.sends.send(small("first.png"));
		t.sends.send(small("second.png"));
		await settle();
		expect(t.state().messages.filter((m) => m.upload).length).toBe(2);
		expect(t.parts.length).toBe(1);
		await landPart(t.parts);
		expect(names(t)).toEqual(["first.png"]);
		await landPart(t.parts);
		expect(names(t)).toEqual(["first.png", "second.png"]);
	});

	test("one failing doesn't hold up the next", async () => {
		const t = setup({ failFinish: new Error("offline") });
		const first = t.sends.send(small("first.png"));
		t.sends.send(small("second.png"));
		await landPart(t.parts);
		await landPart(t.parts);
		expect(names(t)).toEqual(["first.png", "second.png"]);
		expect(
			t.state().messages.find((m) => m.id === first)?.upload?.error,
		).toBeTruthy();
	});

	test("each chat has its own line", async () => {
		const t = setup();
		t.sends.send(small("here.png"));
		t.sends.send(small("there.png", "g-other"));
		await settle();
		expect(t.parts.length).toBe(2);
	});
});

describe("sending a voice note", () => {
	test("shows its waveform and length at once, then the device's words, and posts them", async () => {
		let words: (w: string) => void = () => {};
		const { sends, parts, finishes, state } = setup();
		let done = 0;
		const clientId = sends.send({
			chatId: "g-me",
			name: "Voice note.m4a",
			// The recording's size is a guess until it's read.
			size: 0,
			voice: { durationMs: 4200, waveform: [0.2, 0.8] },
			read: () =>
				new Promise((resolve) => {
					words = (w) =>
						resolve({
							sha256: "cd".repeat(32),
							size: 10,
							readPart: async () => new Uint8Array(10),
							words: w,
						});
				}),
			onDone: () => done++,
		});
		expect(state().messages.at(-1)).toMatchObject({
			id: clientId,
			text: "",
			voice: { durationMs: 4200, waveform: [0.2, 0.8], status: "transcribing" },
			file: { mime: "audio/mp4" },
		});
		words("see you at eight");
		await settle();
		expect(state().messages.at(-1)).toMatchObject({
			id: clientId,
			text: "see you at eight",
			voice: { status: "done" },
		});
		await landPart(parts);
		expect(finishes[0]).toMatchObject({
			clientId,
			size: 10,
			voice: {
				durationMs: 4200,
				waveform: [0.2, 0.8],
				text: "see you at eight",
			},
		});
		expect(state().messages.at(-1)).toMatchObject({
			id: "m-server",
			text: "see you at eight",
			voice: { status: "done" },
		});
		expect(done).toBe(1);
	});
});

test("a send's failure reads as the server's refusal, or the connection", () => {
	expect(
		uploadError(new ApiError(413, "too_large", "That file is over 25 MB.")),
	).toBe("That file is over 25 MB.");
	expect(uploadError(new ApiError(503, "down", "boom"))).toBe(
		"Couldn't send. Check your connection and try again.",
	);
	expect(uploadError(new TypeError("Network request failed"))).toBe(
		"Couldn't send. Check your connection and try again.",
	);
});

test("a sending file's bar shows it started, and fills only once the server has it", () => {
	expect(uploadFraction({ sent: 0, total: 100 })).toBe(0.05);
	expect(uploadFraction({ sent: 50, total: 100 })).toBe(0.5);
	expect(uploadFraction({ sent: 100, total: 100 })).toBe(0.95);
	expect(uploadFraction({ sent: 0, total: 0 })).toBe(0.05);
});
