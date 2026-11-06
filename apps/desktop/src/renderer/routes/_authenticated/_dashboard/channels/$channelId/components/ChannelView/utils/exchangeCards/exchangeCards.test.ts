import { describe, expect, test } from "bun:test";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { combineExchanges } from "./exchangeCards";

const started: TranscriptCardRef = {
	kind: "session",
	key: "session:s-1",
	workspaceId: "w-1",
	sessionId: "s-1",
	agent: "Claude",
	prompt: "Write one sentence on why tests matter.",
	text: "Write one sentence on why tests matter. Then stop.",
};
const workspace: TranscriptCardRef = {
	kind: "workspace",
	key: "workspace:w-1",
	workspaceId: "w-1",
	name: "note-agent",
	branch: "voice-check/note-agent",
};
const read = (key: string, text: string): TranscriptCardRef => ({
	kind: "report",
	key,
	workspaceId: "w-1",
	sessionId: "s-1",
	text,
});

describe("combineExchanges", () => {
	test("a chat started and read becomes one exchange where the talk began", () => {
		const results = combineExchanges([
			workspace,
			started,
			read("report:a", "Tests catch regressions."),
		]);
		expect(results.map(({ card, at }) => [card.kind, at])).toEqual([
			["workspace", "workspace:w-1"],
			["exchange", "session:s-1"],
		]);
		const exchange = results[1]?.card;
		expect(exchange?.kind === "exchange" && exchange.title).toBe(
			"Write one sentence on why tests matter",
		);
		expect(exchange?.kind === "exchange" && exchange.messages).toEqual([
			{
				from: "self",
				text: "Write one sentence on why tests matter. Then stop.",
				sessionId: "s-1",
			},
			{ from: "peer", text: "Tests catch regressions.", sessionId: "s-1" },
		]);
	});

	test("polling the same chat keeps the newest answer", () => {
		const [exchange] = combineExchanges([
			started,
			read("report:a", "Working on it."),
			read("report:b", "Done: tests catch regressions."),
		]);
		expect(
			exchange?.card.kind === "exchange" &&
				exchange.card.messages.map((message) => message.text),
		).toEqual([
			"Write one sentence on why tests matter. Then stop.",
			"Done: tests catch regressions.",
		]);
	});

	test("cards about nothing said pass through where they were", () => {
		expect(combineExchanges([workspace])).toEqual([
			{ card: workspace, at: "workspace:w-1" },
		]);
	});
});
