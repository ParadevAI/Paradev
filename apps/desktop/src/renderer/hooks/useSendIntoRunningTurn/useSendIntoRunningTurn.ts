import { useSyncExternalStore } from "react";

const STORAGE_KEY = "sendIntoRunningTurn";
const CHANGE_EVENT = "send-into-running-turn-changed";

function getSnapshot(): boolean {
	return window.localStorage.getItem(STORAGE_KEY) === "on";
}

function subscribe(onChange: () => void) {
	const onStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY || event.key === null) onChange();
	};
	window.addEventListener(CHANGE_EVENT, onChange);
	window.addEventListener("storage", onStorage);
	return () => {
		window.removeEventListener(CHANGE_EVENT, onChange);
		window.removeEventListener("storage", onStorage);
	};
}

export function setSendIntoRunningTurn(enabled: boolean) {
	if (enabled) window.localStorage.setItem(STORAGE_KEY, "on");
	else window.localStorage.removeItem(STORAGE_KEY);
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Enter hands the message to the running turn instead of queueing it. */
export function useSendIntoRunningTurn(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
