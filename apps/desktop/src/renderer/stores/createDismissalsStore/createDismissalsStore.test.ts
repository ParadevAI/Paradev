import { afterEach, expect, test } from "bun:test";
import { syncPersistedStoreAcrossWindows } from "renderer/stores/syncPersistedStoreAcrossWindows";
import { createDismissalsStore } from "./createDismissalsStore";

const PERSIST_KEY = "dismissals-cross-window-test-v1";

afterEach(() => {
	localStorage.removeItem(PERSIST_KEY);
});

test("a synced window keeps another window's dismissal when it writes its own", async () => {
	const windowA = createDismissalsStore(PERSIST_KEY, "WindowA");
	const windowB = createDismissalsStore(PERSIST_KEY, "WindowB");
	let deliverStorageEvent: ((event: StorageEvent) => void) | undefined;
	const stopSync = syncPersistedStoreAcrossWindows(windowB, {
		addEventListener: (_type, listener) => {
			deliverStorageEvent = listener;
		},
		removeEventListener: () => {
			deliverStorageEvent = undefined;
		},
	});

	windowA.getState().dismiss("project-a");
	deliverStorageEvent?.({
		key: PERSIST_KEY,
		newValue: localStorage.getItem(PERSIST_KEY),
	} as StorageEvent);
	await Promise.resolve();
	expect(windowB.getState().isDismissed("project-a")).toBe(true);

	windowB.getState().dismiss("project-b");
	const persisted = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? "{}");
	expect(Object.keys(persisted.state.dismissedAt).sort()).toEqual([
		"project-a",
		"project-b",
	]);
	stopSync();
});
