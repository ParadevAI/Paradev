import { REDDIT_PIXEL_ID } from "@/lib/constants";

import { canTrack, markTrackerLoaded } from "./consent";

const GOOGLE_ADS_ID = "AW-18209336001";

type RedditPixel = ((...args: unknown[]) => void) & {
	callQueue: unknown[];
	sendEvent?: (...args: unknown[]) => void;
};

type AdWindow = Window & { dataLayer?: unknown[] };

let loaded = false;

function appendScript(src: string): void {
	const script = document.createElement("script");
	script.src = src;
	script.async = true;
	document.head.appendChild(script);
}

function loadAdTrackers(): void {
	if (loaded || !canTrack()) return;
	loaded = true;
	markTrackerLoaded();
	const adWindow = window as AdWindow;

	adWindow.dataLayer = adWindow.dataLayer ?? [];
	adWindow.gtag = function gtag() {
		// biome-ignore lint/complexity/noArguments: gtag.js reads only Arguments objects
		adWindow.dataLayer?.push(arguments);
	};
	adWindow.gtag("js", new Date());
	adWindow.gtag("config", GOOGLE_ADS_ID);
	appendScript(`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`);

	if (!adWindow.rdt) {
		const pixel = function rdt(...args: unknown[]) {
			if (pixel.sendEvent) pixel.sendEvent(...args);
			// biome-ignore lint/complexity/noArguments: pixel.js replays Arguments objects
			else pixel.callQueue.push(arguments);
		} as RedditPixel;
		pixel.callQueue = [];
		adWindow.rdt = pixel;
		appendScript(
			`https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}`,
		);
	}
	adWindow.rdt("init", REDDIT_PIXEL_ID);
	adWindow.rdt("track", "PageVisit");
}

/**
 * Loads Google Ads and the Reddit pixel once the page is idle after load,
 * like next/script lazyOnload. Consent is checked again when the load runs.
 * Returns a function that cancels a load that has not run yet.
 */
export function scheduleAdTrackers(): () => void {
	let cancelIdle: (() => void) | undefined;
	const runWhenIdle = () => {
		if ("requestIdleCallback" in window) {
			const handle = window.requestIdleCallback(loadAdTrackers);
			cancelIdle = () => window.cancelIdleCallback(handle);
		} else {
			const handle = setTimeout(loadAdTrackers, 1);
			cancelIdle = () => clearTimeout(handle);
		}
	};
	if (document.readyState === "complete") runWhenIdle();
	else window.addEventListener("load", runWhenIdle, { once: true });

	return () => {
		window.removeEventListener("load", runWhenIdle);
		cancelIdle?.();
	};
}
