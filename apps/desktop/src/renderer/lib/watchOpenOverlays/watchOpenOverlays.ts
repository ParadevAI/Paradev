const OVERLAY_ROLES = ["menu", "listbox", "dialog", "alertdialog"];
const OVERLAY_SELECTOR = OVERLAY_ROLES.map((role) => `[role="${role}"]`).join(
	",",
);
const OPEN_OVERLAY_SELECTOR = OVERLAY_ROLES.map(
	(role) => `[role="${role}"][data-state="open"]`,
).join(",");

export const OVERLAY_OPEN_ATTRIBUTE = "data-overlay-open";

/** Marks <html> while a menu, listbox or dialog is open. Portals mount as
 *  children of <body>, so only that level is watched. */
export function watchOpenOverlays(doc: Document = document): () => void {
	const { body, documentElement } = doc;
	const sync = () =>
		documentElement.toggleAttribute(
			OVERLAY_OPEN_ATTRIBUTE,
			body.querySelector(OPEN_OVERLAY_SELECTOR) !== null,
		);
	const portals = new MutationObserver(sync);
	portals.observe(body, { childList: true });
	const states = new MutationObserver((records) => {
		const overlayChanged = records.some(
			(record) =>
				record.target instanceof Element &&
				record.target.matches(OVERLAY_SELECTOR),
		);
		if (overlayChanged) sync();
	});
	states.observe(body, { subtree: true, attributeFilter: ["data-state"] });
	sync();
	return () => {
		portals.disconnect();
		states.disconnect();
	};
}
