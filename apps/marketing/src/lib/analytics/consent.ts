import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";
import { CONSENT_REGION_COOKIE, type ConsentRegion } from "./consent-region";

export type ConsentChoice = "accepted" | "declined";

const CONSENT_CHANGE_EVENT = "paradev:consent-change";

export function mayTrack(
	region: ConsentRegion,
	choice: ConsentChoice | null,
): boolean {
	return region === "opt-in" ? choice === "accepted" : choice !== "declined";
}

/** A missing region cookie counts as opt-in. */
export function readConsentRegion(): ConsentRegion {
	const cookie = window.document?.cookie ?? "";
	const match = cookie
		.split("; ")
		.find((entry) => entry.startsWith(`${CONSENT_REGION_COOKIE}=`));
	return match?.slice(CONSENT_REGION_COOKIE.length + 1) === "opt-out"
		? "opt-out"
		: "opt-in";
}

export function readConsentChoice(): ConsentChoice | null {
	const value = window.localStorage?.getItem(ANALYTICS_CONSENT_KEY);
	return value === "accepted" || value === "declined" ? value : null;
}

/** Fails closed: an unreadable choice means no tracking. */
export function canTrack(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return mayTrack(readConsentRegion(), readConsentChoice());
	} catch (error) {
		console.warn("Could not read analytics consent; skipping trackers", error);
		return false;
	}
}

export function saveConsentChoice(choice: ConsentChoice): void {
	window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
	window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

/** Calls back when the choice changes in this tab or another one. */
export function onConsentChange(callback: () => void): () => void {
	const onStorage = (event: StorageEvent) => {
		if (event.key === ANALYTICS_CONSENT_KEY) callback();
	};
	window.addEventListener(CONSENT_CHANGE_EVENT, callback);
	window.addEventListener("storage", onStorage);
	return () => {
		window.removeEventListener(CONSENT_CHANGE_EVENT, callback);
		window.removeEventListener("storage", onStorage);
	};
}
