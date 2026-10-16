import { describe, expect, test } from "bun:test";
import { mergeInboxItems } from "./mergeInboxItems";

const card = (
	id: string,
	tier: "ask" | "update" | "finished",
	workspaceId: string | null,
	minute: number,
) => ({ id, tier, workspaceId, createdAt: new Date(2037, 0, 1, 10, minute) });
const finished = (workspaceId: string, minute: number) => ({
	workspaceId,
	location: "local" as const,
	terminalId: "t",
	agentId: "claude",
	finishedAt: new Date(2037, 0, 1, 10, minute).getTime(),
	terminals: [],
});
const at = (c: { createdAt: Date }) => c.createdAt;
const shape = (
	items: ReturnType<typeof mergeInboxItems<ReturnType<typeof card>>>,
) =>
	items.map((item) =>
		item.kind === "card"
			? item.card.id
			: `finished:${item.entry.workspaceId}${item.card ? `+${item.card.id}` : ""}`,
	);

describe("the inbox as one list", () => {
	test("asks, updates and finished workspaces sit in one list, newest first", () => {
		expect(
			shape(
				mergeInboxItems({
					cards: [card("ask", "ask", null, 30), card("ci", "update", "w9", 10)],
					finished: [finished("w1", 20)],
					at,
				}),
			),
		).toEqual(["ask", "finished:w1", "ci"]);
	});

	test("a workspace shows once: the card its agent pushed folds into the local row", () => {
		expect(
			shape(
				mergeInboxItems({
					cards: [card("pushed", "finished", "w1", 5)],
					finished: [finished("w1", 20)],
					at,
				}),
			),
		).toEqual(["finished:w1+pushed"]);
	});

	test("several pushed cards for one workspace are one row, with the newest", () => {
		expect(
			shape(
				mergeInboxItems({
					cards: [
						card("new", "finished", "w1", 15),
						card("old", "finished", "w1", 5),
					],
					finished: [finished("w1", 20)],
					at,
				}),
			),
		).toEqual(["finished:w1+new"]);
		expect(
			shape(
				mergeInboxItems({
					cards: [
						card("old", "finished", "w2", 5),
						card("new", "finished", "w2", 15),
					],
					finished: [],
					at,
				}),
			),
		).toEqual(["new"]);
	});

	test("a pushed finished card with no workspace, or for a workspace this device does not track, stays its own row", () => {
		expect(
			shape(
				mergeInboxItems({
					cards: [
						card("loose", "finished", null, 9),
						card("elsewhere", "finished", "w7", 8),
					],
					finished: [finished("w1", 20)],
					at,
				}),
			),
		).toEqual(["finished:w1", "loose", "elsewhere"]);
	});

	test("an ask or an update that names the same workspace is never folded", () => {
		expect(
			shape(
				mergeInboxItems({
					cards: [
						card("needs", "ask", "w1", 25),
						card("ci", "update", "w1", 1),
					],
					finished: [finished("w1", 20)],
					at,
				}),
			),
		).toEqual(["needs", "finished:w1", "ci"]);
	});
});
