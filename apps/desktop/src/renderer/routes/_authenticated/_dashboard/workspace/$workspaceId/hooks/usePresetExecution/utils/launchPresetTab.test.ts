import { expect, mock, test } from "bun:test";
import { createWorkspaceStore, transferPaneToNewTab } from "@superset/panes";
import type { PaneViewerData } from "../../../types";
import { launchPresetTab } from "./launchPresetTab";

test("replaces the pending pane with a chat after the pane moves", async () => {
	const store = createWorkspaceStore<PaneViewerData>();
	const right = createWorkspaceStore<PaneViewerData>();
	const ready = Promise.withResolvers<void>();
	const launcher = {
		mint: () => "pending",
		create: mock(async () => "pending"),
	};
	const started = launchPresetTab({
		store,
		linkedStores: [right],
		launcher,
		title: "Codex",
		tryChat: async (place) => {
			await ready.promise;
			place({
				kind: "chat-v3",
				data: { terminalId: "chat", sessionId: null, agent: { id: "codex" } },
			});
			return { terminalId: "chat" };
		},
	});
	await Promise.resolve();
	const paneId = store.getState().getActivePane()?.pane.id;
	if (!paneId) throw new Error("Expected a pending pane");
	store.getState().setPanePinned({ paneId, pinned: true });
	transferPaneToNewTab({ source: store, target: right, paneId });
	ready.resolve();
	await started;
	expect(store.getState().tabs).toHaveLength(0);
	expect(right.getState().tabs).toHaveLength(1);
	expect(right.getState().getPane(paneId)?.pane).toMatchObject({
		kind: "chat-v3",
		pinned: true,
		titleOverride: "Codex",
		data: { terminalId: "chat" },
	});
	expect(launcher.create).not.toHaveBeenCalled();
});

test("does not launch a terminal if the tab closes while choosing a launch mode", async () => {
	const store = createWorkspaceStore<PaneViewerData>();
	const preference = Promise.withResolvers<null>();
	const launcher = {
		mint: () => "pending",
		create: mock(async () => "pending"),
	};
	const started = launchPresetTab({
		store,
		linkedStores: [],
		launcher,
		tryChat: () => preference.promise,
	});
	await Promise.resolve();
	const tab = store.getState().getActiveTab();
	if (!tab) throw new Error("Expected a pending tab");
	store.getState().removeTab(tab.id);
	preference.resolve(null);
	await started;
	expect(store.getState().tabs).toHaveLength(0);
	expect(launcher.create).not.toHaveBeenCalled();
});

test("keeps the selected terminal when an earlier launch fails", async () => {
	const store = createWorkspaceStore<PaneViewerData>();
	const entered = Promise.withResolvers<void>();
	const response = Promise.withResolvers<string>();
	const launcher = {
		mint: () => "pending",
		create: () => {
			entered.resolve();
			return response.promise;
		},
	};
	const started = launchPresetTab({ store, linkedStores: [], launcher });
	await entered.promise;
	const paneId = store.getState().getActivePane()?.pane.id;
	if (!paneId) throw new Error("Expected a pending pane");
	store.getState().setPaneData({ paneId, data: { terminalId: "existing" } });
	response.reject(new Error("offline"));
	await expect(started).rejects.toThrow("offline");
	expect(store.getState().getPane(paneId)?.pane.data).toEqual({
		terminalId: "existing",
	});
});
