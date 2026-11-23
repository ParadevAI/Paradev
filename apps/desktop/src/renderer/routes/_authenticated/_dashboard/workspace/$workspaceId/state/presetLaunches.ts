import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

const launches = createStore<ReadonlyMap<string, Promise<void>>>(
	() => new Map(),
);

function track(key: string, start: () => Promise<void>): Promise<void> {
	const existing = launches.getState().get(key);
	if (existing) return existing;

	const result = Promise.resolve()
		.then(start)
		.finally(() => {
			const remaining = new Map(launches.getState());
			remaining.delete(key);
			launches.setState(remaining, true);
		});
	launches.setState(new Map(launches.getState()).set(key, result), true);
	return result;
}

const presetKey = (workspaceId: string, presetId: string) =>
	`preset:${workspaceId}:${presetId}`;
const terminalKey = (terminalId: string) => `terminal:${terminalId}`;

export function runPresetOnce(
	workspaceId: string,
	presetId: string,
	start: () => Promise<void>,
) {
	return track(presetKey(workspaceId, presetId), start);
}

export async function waitForPresetTerminalCreations(
	creations: readonly Promise<string>[],
): Promise<string[]> {
	try {
		return await Promise.all(creations);
	} catch (error) {
		await Promise.allSettled(creations);
		throw error;
	}
}

export function usePresetStarting(workspaceId: string, presetId: string) {
	return useStore(launches, (pending) =>
		pending.has(presetKey(workspaceId, presetId)),
	);
}

export function startPresetTerminal(
	terminalId: string,
	start: () => Promise<void>,
) {
	return track(terminalKey(terminalId), start);
}

export function usePresetTerminalStarting(terminalId: string) {
	return useStore(launches, (pending) => pending.has(terminalKey(terminalId)));
}

export function afterPresetTerminalStart(
	terminalId: string,
	onSettled: () => void,
) {
	const pending = launches.getState().get(terminalKey(terminalId));
	if (pending) void pending.then(onSettled, onSettled);
	else onSettled();
}
