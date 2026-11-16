import { expect, test } from "bun:test";
import { OVERLAY_OPEN_CLASS, trackOpenOverlays } from "./overlayOpenClass";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("marks the root while a portaled or toggled overlay is open", async () => {
	const root = document.createElement("div");
	document.body.append(root);
	const stop = trackOpenOverlays(root);
	expect(root.classList.contains(OVERLAY_OPEN_CLASS)).toBe(false);

	const menu = document.createElement("div");
	menu.setAttribute("role", "menu");
	menu.setAttribute("data-state", "open");
	root.append(menu);
	await flush();
	expect(root.classList.contains(OVERLAY_OPEN_CLASS)).toBe(true);

	menu.setAttribute("data-state", "closed");
	await flush();
	expect(root.classList.contains(OVERLAY_OPEN_CLASS)).toBe(false);

	stop();
	root.remove();
});
