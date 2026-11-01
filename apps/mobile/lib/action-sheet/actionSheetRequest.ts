import { useSyncExternalStore } from "react";
import type { ActionSheetOptions } from "./showActionSheet.types";

export interface ActionSheetRequest {
	options: ActionSheetOptions;
	onSelect: (index: number) => void;
}

let pending: ActionSheetRequest | null = null;
const listeners = new Set<() => void>();

/** Calls `listener` when a sheet opens or closes. */
export function subscribeActionSheet(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

const current = () => pending;

function emit() {
	for (const listener of listeners) listener();
}

/** The open action sheet, for the mounted `ActionSheetHost`. */
export function useActionSheetRequest() {
	return useSyncExternalStore(subscribeActionSheet, current, current);
}

/** Opens a sheet; one already open is cancelled first. False when no host is mounted. */
export function requestActionSheet(request: ActionSheetRequest) {
	if (listeners.size === 0) return false;
	settleActionSheet();
	pending = request;
	emit();
	return true;
}

/** Closes the open sheet and reports `index`, or its cancel index when none is given. */
export function settleActionSheet(index?: number) {
	const request = pending;
	if (!request) return;
	pending = null;
	emit();
	const chosen = index ?? request.options.cancelButtonIndex;
	if (chosen !== undefined) request.onSelect(chosen);
}
