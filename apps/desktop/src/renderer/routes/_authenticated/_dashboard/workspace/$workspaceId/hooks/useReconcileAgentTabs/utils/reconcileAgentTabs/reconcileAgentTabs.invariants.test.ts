import { describe, it } from "bun:test";
import {
	type CreatePaneInput,
	createWorkspaceStore,
	type Pane,
	type WorkspaceState,
} from "@superset/panes";
import {
	type ChatPaneData,
	type PaneViewerData,
	PENDING_CLOUD_LAUNCH_PANE_KIND,
} from "../../../../types";
import type { ListedChatSession } from "../chatConversations";
import {
	type ListedTerminalSession,
	type ReconcileAgentTabsInput,
	reconcileAgentTabs,
} from "./reconcileAgentTabs";

type Layout = WorkspaceState<PaneViewerData>;

/** Seeded so a failure names the run that found it and replays exactly. */
function random(seed: number) {
	let state = seed >>> 0;
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		chance: (p: number) => next() < p,
		pick: <T>(items: readonly T[]): T | undefined =>
			items[Math.floor(next() * items.length)],
	};
}

interface World {
	clock: number;
	ids: number;
	chats: ListedChatSession[];
	terminals: ListedTerminalSession[];
	main: Layout;
	right: Layout;
	hiddenSessions: Set<string>;
	hiddenChatTerminals: Set<string>;
	hiddenTerminals: Set<string>;
	reopened: Set<string>;
	oldHost: boolean;
	openedEmpty: boolean;
	/** The model's own truth: which conversation each chat row belongs to. */
	conversationOf: Map<string, string>;
	terminalOf: Map<string, string | null>;
	latestOf: Map<string, string>;
}

/** A host runs one harness per terminal: a new session there stops the one before. */
function addRow(
	world: World,
	row: ListedChatSession,
	conversation: string,
	terminal: string | null,
): void {
	for (const chat of world.chats) {
		if (world.conversationOf.get(chat.sessionId) === conversation)
			stopHarness(world, chat);
	}
	world.chats.push(row);
	world.conversationOf.set(row.sessionId, conversation);
	world.terminalOf.set(conversation, terminal);
	world.latestOf.set(conversation, row.sessionId);
}

/** The model's own reading of what a pane shows, independent of the code under test. */
function paneClaimKeys(pane: Pane<PaneViewerData>): {
	terminalId: string | null;
	sessionId: string | null;
} {
	const data = pane.data as { terminalId?: string; sessionId?: string | null };
	const agent =
		pane.kind === "chat-v3" ||
		pane.kind === "terminal" ||
		pane.kind === PENDING_CLOUD_LAUNCH_PANE_KIND;
	return {
		terminalId: agent ? (data.terminalId ?? null) : null,
		sessionId: pane.kind === "chat-v3" ? (data.sessionId ?? null) : null,
	};
}

const emptyLayout = (): Layout => ({ version: 1, tabs: [], activeTabId: null });

function edit(
	state: Layout,
	change: (
		store: ReturnType<typeof createWorkspaceStore<PaneViewerData>>,
	) => void,
): Layout {
	const store = createWorkspaceStore<PaneViewerData>({ initialState: state });
	change(store);
	const { version, tabs, activeTabId } = store.getState();
	return { version, tabs, activeTabId };
}

const panesOf = (state: Layout) =>
	state.tabs.flatMap((tab) =>
		Object.values(tab.panes).map((pane) => ({ tabId: tab.id, pane })),
	);

function stopHarness(world: World, chat: ListedChatSession): void {
	if (!chat.live) return;
	const launch = chat.terminalId;
	chat.live = false;
	chat.terminalId = null;
	if (!world.oldHost) chat.launchTerminalId = launch;
}

/** One thing that happens to a workspace: on the host, or by the user. */
function step(world: World, rng: ReturnType<typeof random>): void {
	world.clock += 1;
	const id = () => {
		world.ids += 1;
		return `${world.ids}`;
	};
	const openChats = world.chats.filter((chat) => !chat.closedAt);
	const anyChat = rng.pick(openChats);
	const agentPanes = [
		...panesOf(world.main).map((entry) => ({
			...entry,
			area: "main" as const,
		})),
		...panesOf(world.right).map((entry) => ({
			...entry,
			area: "right" as const,
		})),
	];
	const anyPane = rng.pick(agentPanes);
	switch (
		rng.pick([
			"launchChat",
			"launchChat",
			"stop",
			"resumeOnTerminal",
			"rewind",
			"closedElsewhere",
			"hostCloses",
			"launchTerminal",
			"killTerminal",
			"userClosesTab",
			"moveToRight",
			"openFile",
			"reopenFromHistory",
			"racingWriter",
			"cliNewTabLatest",
			"pendingLaunch",
			"mobileChat",
		] as const)
	) {
		case "launchChat": {
			const terminal = `t${id()}`;
			addRow(
				world,
				chatRow(`s${id()}`, terminal, world.clock),
				terminal,
				terminal,
			);
			return;
		}
		case "mobileChat": {
			const session = `s${id()}`;
			addRow(world, chatRow(session, null, world.clock), session, null);
			return;
		}
		case "stop":
			if (anyChat) stopHarness(world, anyChat);
			return;
		case "resumeOnTerminal":
		case "rewind": {
			if (!anyChat) return;
			const conversation = world.conversationOf.get(
				anyChat.sessionId,
			) as string;
			const terminal = world.terminalOf.get(conversation);
			if (!terminal) return;
			stopHarness(world, anyChat);
			addRow(
				world,
				chatRow(`s${id()}`, terminal, world.clock),
				conversation,
				terminal,
			);
			return;
		}
		case "closedElsewhere":
			if (!anyChat) return;
			stopHarness(world, anyChat);
			anyChat.closedAt = world.clock;
			anyChat.closedByUser = true;
			return;
		case "hostCloses":
			if (!anyChat) return;
			stopHarness(world, anyChat);
			anyChat.closedAt = world.clock;
			return;
		case "launchTerminal":
			world.terminals.push({
				terminalId: `pty${id()}`,
				createdAt: world.clock,
			});
			return;
		case "killTerminal": {
			const terminal = rng.pick(world.terminals);
			if (terminal)
				world.terminals = world.terminals.filter((t) => t !== terminal);
			return;
		}
		case "userClosesTab": {
			if (!anyPane) return;
			const { terminalId, sessionId } = paneClaimKeys(anyPane.pane);
			if (anyPane.pane.kind === "terminal" && terminalId) {
				if (rng.chance(0.5)) world.hiddenTerminals.add(terminalId);
				else
					world.terminals = world.terminals.filter(
						(t) => t.terminalId !== terminalId,
					);
			} else if (anyPane.pane.kind !== "file") {
				if (terminalId) world.hiddenChatTerminals.add(terminalId);
				if (sessionId) world.hiddenSessions.add(sessionId);
			}
			const close = (state: Layout) =>
				edit(state, (store) =>
					store.getState().closePane({
						tabId: anyPane.tabId,
						paneId: anyPane.pane.id,
						intent: "remove",
					}),
				);
			if (anyPane.area === "main") world.main = close(world.main);
			else world.right = close(world.right);
			return;
		}
		case "moveToRight": {
			const entry = rng.pick(panesOf(world.main));
			if (!entry) return;
			world.main = edit(world.main, (store) =>
				store.getState().closePane({
					tabId: entry.tabId,
					paneId: entry.pane.id,
					intent: "remove",
				}),
			);
			world.right = edit(world.right, (store) =>
				store.getState().addTab({
					panes: [{ kind: entry.pane.kind, data: entry.pane.data }],
				}),
			);
			return;
		}
		case "openFile":
			world.main = edit(world.main, (store) =>
				store.getState().addTab({
					panes: [
						{ kind: "file", data: { filePath: `f${id()}`, mode: "editor" } },
					],
				}),
			);
			return;
		case "reopenFromHistory": {
			const chat = rng.pick(world.chats);
			if (!chat) return;
			const shown = agentPanes.some(
				({ pane }) => paneClaimKeys(pane).sessionId === chat.sessionId,
			);
			world.hiddenSessions.delete(chat.sessionId);
			world.reopened.add(chat.sessionId);
			if (shown) return;
			world.main = edit(world.main, (store) =>
				store.getState().addTab({
					panes: [chatPane(chat.terminalId ?? `r${id()}`, chat.sessionId)],
				}),
			);
			return;
		}
		case "racingWriter": {
			const entry = rng.pick(agentPanes);
			if (!entry || entry.pane.kind === PENDING_CLOUD_LAUNCH_PANE_KIND) return;
			world.main = edit(world.main, (store) =>
				store.getState().addTab({
					panes: [{ kind: entry.pane.kind, data: entry.pane.data }],
				}),
			);
			return;
		}
		case "cliNewTabLatest": {
			const conversation = rng.pick([...world.latestOf.keys()]);
			if (!conversation) return;
			const latest = world.latestOf.get(conversation) as string;
			const terminal = world.terminalOf.get(conversation) ?? latest;
			if (
				agentPanes.some(({ pane }) => paneClaimKeys(pane).sessionId === latest)
			)
				return;
			world.main = edit(world.main, (store) =>
				store.getState().addTab({ panes: [chatPane(terminal, latest)] }),
			);
			return;
		}
		case "pendingLaunch": {
			const terminal = `t${id()}`;
			world.main = edit(world.main, (store) =>
				store.getState().addTab({
					panes: [
						{
							kind: PENDING_CLOUD_LAUNCH_PANE_KIND,
							data: { draftId: id(), agentId: "claude", terminalId: terminal },
						},
					],
				}),
			);
			if (rng.chance(0.7))
				addRow(
					world,
					chatRow(`s${id()}`, terminal, world.clock),
					terminal,
					terminal,
				);
			return;
		}
	}
}

function chatRow(
	sessionId: string,
	terminalId: string | null,
	at: number,
): ListedChatSession {
	return {
		sessionId,
		harness: "claude-acp",
		harnessSessionId: `h-${sessionId}`,
		title: null,
		updatedAt: at,
		live: true,
		terminalId,
		closedAt: null,
		closedByUser: false,
	};
}

function chatPane(
	terminalId: string,
	sessionId: string,
): CreatePaneInput<PaneViewerData> {
	return {
		kind: "chat-v3",
		data: { terminalId, sessionId, agent: { id: "claude" } } as ChatPaneData,
	};
}

function inputOf(
	world: World,
	rng: ReturnType<typeof random>,
): ReconcileAgentTabsInput {
	return {
		main: world.main,
		linked: [world.right],
		chats: rng.chance(0.85)
			? world.chats.map((chat) => ({ ...chat }))
			: undefined,
		terminals: rng.chance(0.85) ? [...world.terminals] : undefined,
		presetFor: () => "claude",
		hiding: {
			chatSession: (sessionId) => world.hiddenSessions.has(sessionId),
			chatTerminal: (terminalId) => world.hiddenChatTerminals.has(terminalId),
			terminal: (terminalId) => world.hiddenTerminals.has(terminalId),
			reopened: (sessionId) => world.reopened.has(sessionId),
		},
		openedEmpty: world.openedEmpty,
	};
}

const allPanes = (main: Layout, linked: readonly Layout[]) =>
	[main, ...linked].flatMap((state) => panesOf(state).map(({ pane }) => pane));

function checkInvariants(
	world: World,
	input: ReconcileAgentTabsInput,
	main: Layout,
	linked: Layout[],
): void {
	const panes = allPanes(main, linked);
	const before = allPanes(input.main, input.linked);
	const beforeIds = new Set(before.map((pane) => pane.id));
	const added = panes.filter((pane) => !beforeIds.has(pane.id));

	const terminalPanes = panes
		.filter((pane) => pane.kind === "terminal")
		.map((pane) => paneClaimKeys(pane).terminalId);
	if (new Set(terminalPanes).size !== terminalPanes.length)
		throw new Error(`two panes on one terminal: ${terminalPanes}`);
	const chatSessions = panes
		.map((pane) => paneClaimKeys(pane).sessionId)
		.filter(Boolean);
	const chatTerminals = panes
		.filter((pane) => pane.kind === "chat-v3" && paneClaimKeys(pane).sessionId)
		.map((pane) => paneClaimKeys(pane).terminalId);
	if (new Set(chatTerminals).size !== chatTerminals.length) {
		throw new Error(`two chat panes on one terminal: ${chatTerminals}`);
	}
	if (new Set(chatSessions).size !== chatSessions.length)
		throw new Error(`two panes on one chat: ${chatSessions}`);

	const claimedTerminals = new Set(
		panes.map((pane) => paneClaimKeys(pane).terminalId).filter(Boolean),
	);
	if (input.chats) {
		const conversations = [...new Set(world.conversationOf.values())];
		const sessionsOf = (conversation: string) =>
			[...world.conversationOf]
				.filter(([, c]) => c === conversation)
				.map(([sessionId]) => sessionId);
		const rowOf = (sessionId: string) =>
			input.chats?.find((chat) => chat.sessionId === sessionId);
		const isOpen = (conversation: string) => {
			const latest = rowOf(world.latestOf.get(conversation) as string);
			return (
				!!latest && (latest.live || (!latest.closedAt && !latest.closedByUser))
			);
		};
		const claims = (conversation: string, pane: Pane<PaneViewerData>) => {
			const keys = paneClaimKeys(pane);
			const terminal = world.terminalOf.get(conversation);
			return (
				(!!keys.sessionId &&
					sessionsOf(conversation).includes(keys.sessionId)) ||
				(!!keys.terminalId &&
					(keys.terminalId === terminal || keys.terminalId === conversation))
			);
		};
		for (const conversation of conversations) {
			const terminal = world.terminalOf.get(conversation);
			const hidden =
				sessionsOf(conversation).some(input.hiding.chatSession) ||
				(!!terminal && input.hiding.chatTerminal(terminal));
			const addedForIt = added.filter((pane) => claims(conversation, pane));
			const addedHiddenPane = addedForIt.some((pane) => {
				const keys = paneClaimKeys(pane);
				return (
					(!!keys.sessionId && input.hiding.chatSession(keys.sessionId)) ||
					(!!keys.terminalId && input.hiding.chatTerminal(keys.terminalId))
				);
			});
			if (
				addedHiddenPane ||
				(hidden && addedForIt.length > 0 && !world.oldHost)
			) {
				throw new Error(`added hidden conversation ${conversation}`);
			}
			if (world.oldHost) continue;
			if (!isOpen(conversation) && addedForIt.length > 0)
				throw new Error(`added closed conversation ${conversation}`);
			if (
				isOpen(conversation) &&
				!hidden &&
				!panes.some((pane) => claims(conversation, pane))
			) {
				throw new Error(`open conversation ${conversation} has no pane`);
			}
			if (addedForIt.length > 1)
				throw new Error(`added ${addedForIt.length} tabs for ${conversation}`);
			if (
				addedForIt.length > 0 &&
				before.some((pane) => claims(conversation, pane))
			) {
				throw new Error(
					`added a tab for conversation ${conversation} that a pane already showed`,
				);
			}
		}
		for (const pane of panes) {
			const sessionId = paneClaimKeys(pane).sessionId;
			if (!sessionId) continue;
			const row = rowOf(sessionId);
			const conversation = world.conversationOf.get(sessionId);
			if (
				row?.closedByUser &&
				!row.live &&
				conversation &&
				!isOpen(conversation) &&
				!input.hiding.reopened(sessionId)
			) {
				throw new Error(
					`pane kept a chat closed elsewhere: ${sessionId} pane=${JSON.stringify(paneClaimKeys(pane))} rows=${JSON.stringify(input.chats?.filter((c) => world.conversationOf.get(c.sessionId) === conversation))} latest=${world.latestOf.get(conversation)}`,
				);
			}
		}
	}
	if (input.terminals) {
		for (const terminal of input.terminals) {
			if (
				!input.hiding.terminal(terminal.terminalId) &&
				!claimedTerminals.has(terminal.terminalId)
			) {
				throw new Error(`terminal ${terminal.terminalId} has no pane`);
			}
		}
	}
	for (const pane of added) {
		const { terminalId } = paneClaimKeys(pane);
		if (
			pane.kind === "terminal" &&
			terminalId &&
			input.hiding.terminal(terminalId)
		) {
			throw new Error(`added hidden terminal ${terminalId}`);
		}
	}

	const keptNonAgent = before.filter(
		(pane) =>
			!["chat-v3", "terminal", PENDING_CLOUD_LAUNCH_PANE_KIND].includes(
				pane.kind,
			),
	);
	for (const pane of [
		...keptNonAgent,
		...before.filter((p) => p.kind === PENDING_CLOUD_LAUNCH_PANE_KIND),
	]) {
		if (!panes.some((candidate) => candidate.id === pane.id))
			throw new Error(`removed a ${pane.kind} pane`);
	}
	for (const state of linked) {
		const ids = new Set(panesOf(state).map(({ pane }) => pane.id));
		if (added.some((pane) => ids.has(pane.id)))
			throw new Error("opened a tab in a linked area");
	}

	const previous = input.main.activeTabId;
	const selectsChat =
		input.openedEmpty &&
		input.main.tabs.every((tab) =>
			Object.values(tab.panes).every((pane) => pane.kind === "terminal"),
		);
	if (
		previous &&
		!selectsChat &&
		main.tabs.some((tab) => tab.id === previous) &&
		main.activeTabId !== previous
	) {
		throw new Error("moved the user's selection");
	}
	if (
		main.tabs.length > 0 &&
		!main.tabs.some((tab) => tab.id === main.activeTabId)
	)
		throw new Error("no tab selected");

	const again = reconcileAgentTabs({ ...input, main, linked });
	if (again.changed) {
		const describe = (state: Layout) =>
			panesOf(state).map(
				({ pane }) => `${pane.kind}:${JSON.stringify(paneClaimKeys(pane))}`,
			);
		throw new Error(
			`not idempotent: ${JSON.stringify(describe(main))} -> ${JSON.stringify(describe(again.main))}`,
		);
	}
}

describe("reconcileAgentTabs invariants", () => {
	for (const oldHost of [false, true]) {
		it(`holds through random workspace histories${oldHost ? " on a host without launch terminals" : ""}`, () => {
			for (let seed = 1; seed <= 300; seed++) {
				const rng = random(seed * (oldHost ? 7919 : 1));
				const world: World = {
					clock: 0,
					ids: 0,
					chats: [],
					terminals: [],
					main: emptyLayout(),
					right: emptyLayout(),
					hiddenSessions: new Set(),
					hiddenChatTerminals: new Set(),
					hiddenTerminals: new Set(),
					reopened: new Set(),
					oldHost,
					openedEmpty: rng.chance(0.5),
					conversationOf: new Map(),
					terminalOf: new Map(),
					latestOf: new Map(),
				};
				for (let move = 0; move < 40; move++) {
					step(world, rng);
					const input = inputOf(world, rng);
					try {
						const result = reconcileAgentTabs(input);
						checkInvariants(world, input, result.main, result.linked);
						world.main = result.main;
						world.right = result.linked[0] ?? world.right;
					} catch (error) {
						throw new Error(
							`seed ${seed}${oldHost ? " (old host)" : ""}, move ${move}: ${(error as Error).message}`,
						);
					}
				}
			}
		});
	}
});
