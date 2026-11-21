import { useSyncExternalStore } from "react";
import type { Prompt, PromptOptions } from "./AlertPrompt.types";

interface PendingPrompt {
	id: number;
	options: PromptOptions;
	resolve: (value: string | null) => void;
}

const queue: PendingPrompt[] = [];
let nextId = 0;
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

/** The prompt the mounted `AlertPromptHost` shows, oldest first. */
export function usePendingPrompt() {
	return useSyncExternalStore(subscribe, current, current);
}

export function settlePrompt(value: string | null) {
	const pending = queue.shift();
	pending?.resolve(value);
	emit();
}

export const enqueuePrompt: Prompt = (options) =>
	new Promise((resolve) => {
		queue.push({ id: nextId++, options, resolve });
		emit();
	});
