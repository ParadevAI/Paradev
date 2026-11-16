import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { chatPanesResumedElsewhere } from "./chatPanesResumedElsewhere";

const NOW = 1_000_000;

function storeWithChat(sessionId: string, extra = {}) {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [
			{
				kind: "chat-v3",
				data: {
					terminalId: "desktop-terminal",
					sessionId,
					agent: { id: "claude" },
					...extra,
				},
			},
		],
	});
	return store;
}

const listed = (
	sessionId: string,
	overrides: {
		harnessSessionId?: string;
		updatedAt?: number;
		live?: boolean;
		closedAt?: number;
		closedByUser?: boolean;
		terminalId?: string | null;
	} = {},
) => ({
	sessionId,
	harness: "claude-acp",
	harnessSessionId: "native-shared",
	updatedAt: NOW,
	live: false,
	terminalId: null as string | null,
	...overrides,
});

const closedByHost = listed("desktop", { updatedAt: NOW - 10, closedAt: NOW });

describe("chatPanesResumedElsewhere", () => {
	it("moves a pane onto the chat that resumed its agent session on another device", () => {
		const store = storeWithChat("desktop");
		const paneId = Object.keys(store.getState().tabs[0]?.panes ?? {})[0];
		expect(
			chatPanesResumedElsewhere(
				[
					closedByHost,
					listed("older-resume", { updatedAt: NOW - 5 }),
					listed("resumed-on-phone", { live: true }),
				],
				store.getState().tabs,
			),
		).toEqual([{ paneId: paneId as string, sessionId: "resumed-on-phone" }]);
	});

	it("leaves panes alone when their chat is open, closed by a person, moving, recovering itself, or has no open resume", () => {
		const resumed = listed("resumed-on-phone", { live: true });
		const leftAlone = (
			shown: ReturnType<typeof listed>,
			store = storeWithChat("desktop"),
		) => chatPanesResumedElsewhere([shown, resumed], store.getState().tabs);

		expect(leftAlone(listed("desktop", { live: true }))).toEqual([]);
		expect(leftAlone({ ...closedByHost, closedByUser: true })).toEqual([]);
		expect(
			leftAlone(closedByHost, storeWithChat("desktop", { awaitingMove: true })),
		).toEqual([]);
		expect(
			leftAlone({ ...closedByHost, harnessSessionId: "native-other" }),
		).toEqual([]);
		expect(
			chatPanesResumedElsewhere(
				[
					closedByHost,
					listed("own-recovery", {
						live: true,
						terminalId: "desktop-terminal",
					}),
				],
				storeWithChat("desktop").getState().tabs,
			),
		).toEqual([]);
		expect(
			chatPanesResumedElsewhere(
				[closedByHost, listed("resumed-on-phone", { closedAt: NOW })],
				storeWithChat("desktop").getState().tabs,
			),
		).toEqual([]);
	});
});
