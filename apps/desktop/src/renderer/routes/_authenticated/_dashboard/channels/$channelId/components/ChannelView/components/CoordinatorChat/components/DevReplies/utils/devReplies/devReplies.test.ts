import { describe, expect, test } from "bun:test";
import {
	type ChannelMessage,
	pendingMessage,
} from "renderer/routes/_authenticated/utils/channelMessageCache";
import { devPickupState, isSaved, postedRoot } from "./devReplies";

const T0 = 1_800_000_000_000;

function message(
	overrides: Partial<ChannelMessage> & { id: string },
): ChannelMessage {
	return {
		...pendingMessage({
			channelId: "c-1",
			authorId: "me",
			body: "@Ticket hi",
			clientId: overrides.id,
			threadRootId: null,
			mentionedIds: ["dev-1"],
		}),
		seq: 7,
		createdAt: new Date(T0),
		...overrides,
	};
}

describe("postedRoot", () => {
	test("finds the person's top-level copy nearest the coordinator's", () => {
		const messages = [
			message({ id: "old", createdAt: new Date(T0 - 5 * 60_000) }),
			message({ id: "near", createdAt: new Date(T0 + 2_000) }),
			message({ id: "reply", threadRootId: "near" }),
			message({ id: "theirs", authorId: "someone-else" }),
		];
		expect(
			postedRoot(messages, { authorId: "me", text: " @Ticket hi ", at: T0 })
				?.id,
		).toBe("near");
	});

	test("ignores other text, deleted copies, and copies made later", () => {
		const messages = [
			message({ id: "other", body: "@Ticket bye" }),
			message({ id: "deleted", deletedAt: new Date(T0) }),
			message({ id: "later", createdAt: new Date(T0 + 60 * 60_000) }),
		];
		expect(
			postedRoot(messages, { authorId: "me", text: "@Ticket hi", at: T0 }),
		).toBeNull();
	});

	test("a replayed message, stamped later, finds the newest earlier copy", () => {
		const messages = [
			message({ id: "first", createdAt: new Date(T0 - 3 * 60 * 60_000) }),
			message({ id: "second", createdAt: new Date(T0 - 2 * 60 * 60_000) }),
		];
		expect(
			postedRoot(messages, { authorId: "me", text: "@Ticket hi", at: T0 })?.id,
		).toBe("second");
	});

	test("a copy still on its way is not saved yet", () => {
		const pending = pendingMessage({
			channelId: "c-1",
			authorId: "me",
			body: "x",
			clientId: "p",
			threadRootId: null,
			mentionedIds: [],
		});
		expect(isSaved(pending)).toBe(false);
		expect(isSaved(message({ id: "saved" }))).toBe(true);
	});
});

describe("devPickupState", () => {
	const base = {
		devId: "dev-1",
		replies: [],
		turnStatus: null,
		busy: false,
		postedAt: T0,
		now: T0 + 5_000,
	};

	test("a reply from the Dev means it answered, whatever its turn says", () => {
		expect(
			devPickupState({
				...base,
				replies: [message({ id: "r", authorId: "dev-1", threadRootId: "x" })],
				turnStatus: "running",
			}),
		).toBe("answered");
	});

	test("follows the Dev's turn for the thread", () => {
		expect(devPickupState({ ...base, turnStatus: "running" })).toBe(
			"answering",
		);
		expect(devPickupState({ ...base, turnStatus: "completed" })).toBe("quiet");
		expect(devPickupState({ ...base, turnStatus: "interrupted" })).toBe(
			"failed",
		);
	});

	test("with no turn, waits a while, longer when the Dev is busy, then calls it missed", () => {
		expect(devPickupState(base)).toBe("answering");
		const late = { ...base, now: T0 + 60_000 };
		expect(devPickupState(late)).toBe("missed");
		expect(devPickupState({ ...late, busy: true })).toBe("answering");
	});
});
