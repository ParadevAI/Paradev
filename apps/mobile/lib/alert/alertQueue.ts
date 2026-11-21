import { useSyncExternalStore } from "react";
import type { AlertButton, AlertOptions } from "react-native";

export interface PendingAlert {
	title: string;
	message?: string;
	buttons: AlertButton[];
	options?: AlertOptions;
}

const queue: PendingAlert[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function emit() {
	for (const listener of listeners) listener();
}

const current = () => queue[0];

/** The alert the mounted `AlertHost` shows, oldest first. */
export function usePendingAlert() {
	return useSyncExternalStore(subscribe, current, current);
}

export function enqueueAlert(alert: PendingAlert) {
	queue.push(alert);
	emit();
}

/** Closes the shown alert, then runs the chosen button's handler. */
export function settleAlert(button: AlertButton | undefined) {
	queue.shift();
	emit();
	button?.onPress?.(button.text);
}
