const OPEN_OVERLAY_SELECTOR = [
	'[role="menu"][data-state="open"]',
	'[role="listbox"][data-state="open"]',
	'[role="dialog"][data-state="open"]',
	'[role="alertdialog"][data-state="open"]',
].join(",");

export const OVERLAY_OPEN_CLASS = "overlay-open";

/**
 * Sets `overlay-open` on `<body>` while a menu, listbox or dialog is open.
 * A `body:has(...)` selector did the same, but Chrome re-matched it against
 * the whole page on every `data-state` change anywhere.
 */
export function trackOpenOverlays(
	root: HTMLElement = document.body,
): () => void {
	const update = () => {
		root.classList.toggle(
			OVERLAY_OPEN_CLASS,
			root.querySelector(OPEN_OVERLAY_SELECTOR) !== null,
		);
	};
	// Overlays portal into body, so new ones arrive as its direct children.
	const portals = new MutationObserver(update);
	portals.observe(root, { childList: true });
	const states = new MutationObserver(update);
	states.observe(root, {
		attributes: true,
		attributeFilter: ["data-state"],
		subtree: true,
	});
	update();
	return () => {
		portals.disconnect();
		states.disconnect();
	};
}
