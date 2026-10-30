import { useSyncExternalStore } from "react";
import type {
	AttachmentsSheetHandlers,
	PresentAttachmentsSheet,
} from "./AttachmentsSheet.types";

let pending: AttachmentsSheetHandlers | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

const current = () => pending;

/** The handlers of the open sheet, for the mounted `AttachmentsSheetHost`. */
export function useAttachmentsSheetRequest() {
	return useSyncExternalStore(subscribe, current, current);
}

/** Closes the open sheet; the host then calls exactly one of its handlers. */
export function settleAttachmentsSheet() {
	pending = null;
	emit();
}

export const presentAttachmentsSheet: PresentAttachmentsSheet = async (
	_theme,
	handlers,
) => {
	if (listeners.size === 0) return false;
	pending?.onDismiss?.();
	pending = handlers;
	emit();
	return true;
};
