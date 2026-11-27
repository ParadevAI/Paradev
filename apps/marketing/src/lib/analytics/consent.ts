import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";
import {
	CONSENT_REGION_COOKIE,
	type ConsentRegion,
	parseConsentCookie,
} from "./consent-region";

export type ConsentChoice = "accepted" | "declined";

const CONSENT_CHANGE_EVENT = "paradev:consent-change";
const TRACKER_LOADED_KEY = Symbol.for("paradev.trackerLoaded");
const COOKIELESS_KEY = Symbol.for("paradev.cookielessAnalytics");

type TrackerWindow = Window & {
	[TRACKER_LOADED_KEY]?: true;
	[COOKIELESS_KEY]?: true;
};

/** Records that a tracker has loaded in this document, which only a reload undoes. */
export function markTrackerLoaded(): void {
	(window as TrackerWindow)[TRACKER_LOADED_KEY] = true;
}

export function hasLoadedTracker(): boolean {
	return (window as TrackerWindow)[TRACKER_LOADED_KEY] === true;
}

/** Records that PostHog runs without cookies in this document. */
export function markCookielessAnalytics(): void {
	(window as TrackerWindow)[COOKIELESS_KEY] = true;
}

export function hasCookielessAnalytics(): boolean {
	return (window as TrackerWindow)[COOKIELESS_KEY] === true;
}

export function mayTrack(
	region: ConsentRegion,
	choice: ConsentChoice | null,
): boolean {
	return region === "opt-in" ? choice === "accepted" : choice !== "declined";
}

function readConsentCookie() {
	const cookie = window.document?.cookie ?? "";
	const match = cookie
		.split("; ")
		.find((entry) => entry.startsWith(`${CONSENT_REGION_COOKIE}=`));
	return parseConsentCookie(match?.slice(CONSENT_REGION_COOKIE.length + 1));
}

/** A missing region cookie counts as opt-in. */
export function readConsentRegion(): ConsentRegion {
	return readConsentCookie().region;
}

export function readConsentCountry(): string | null {
	return readConsentCookie().country;
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
