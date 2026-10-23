import type { WebContents } from "electron";

type ZoomableContents = Pick<
	WebContents,
	"on" | "getZoomLevel" | "setZoomLevel" | "isDestroyed"
>;

/**
 * Chromium keys file:// zoom by the full URL, hash route included, and
 * re-reads it on resize. Carry the zoom onto each new route, and keep the
 * browser panes' own zoom, which Electron overwrites when the window's changes.
 */
export function keepZoomAcrossRoutes(
	contents: ZoomableContents,
	{
		listGuests,
		onDocumentLeave,
	}: {
		listGuests: () => ZoomableContents[];
		onDocumentLeave: (zoomLevel: number) => void;
	},
): void {
	let zoomLevel: number | undefined;

	contents.on("did-start-navigation", (details) => {
		if (!details.isMainFrame) return;
		zoomLevel = contents.getZoomLevel();
		if (!details.isSameDocument) onDocumentLeave(zoomLevel);
	});

	contents.on("did-navigate-in-page", (_event, _url, isMainFrame) => {
		if (!isMainFrame || zoomLevel === undefined) return;
		if (contents.getZoomLevel() === zoomLevel) return;
		const guests = listGuests().map(
			(guest) => [guest, guest.getZoomLevel()] as const,
		);
		contents.setZoomLevel(zoomLevel);
		for (const [guest, guestZoomLevel] of guests) {
			if (!guest.isDestroyed() && guest.getZoomLevel() !== guestZoomLevel) {
				guest.setZoomLevel(guestZoomLevel);
			}
		}
	});
}
