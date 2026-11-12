import {
	type ConsentChoice,
	collectTouchSnapshot,
	type TouchOptions,
} from "./touch";

export * from "./touch";

export function collectBrowserTouch(
	choice: ConsentChoice,
	options: TouchOptions = {},
) {
	if (choice !== "accepted") return null;
	try {
		return collectTouchSnapshot(
			{ href: window.location.href, referrer: document.referrer },
			options,
		);
	} catch {
		return null;
	}
}
