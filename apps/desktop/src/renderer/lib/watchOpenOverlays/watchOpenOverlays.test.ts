import { afterEach, describe, expect, test } from "bun:test";
import { OVERLAY_OPEN_ATTRIBUTE, watchOpenOverlays } from "./watchOpenOverlays";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let stop: (() => void) | undefined;
afterEach(() => stop?.());

function setup() {
	const doc = document.implementation.createHTMLDocument();
	const isMarked = () =>
		doc.documentElement.hasAttribute(OVERLAY_OPEN_ATTRIBUTE);
	return { doc, isMarked };
}

describe("watchOpenOverlays", () => {
	test("marks the document while a portaled menu is open, and clears it when the menu closes in place", async () => {
		const { doc, isMarked } = setup();
		stop = watchOpenOverlays(doc);
		const portal = doc.createElement("div");
		portal.innerHTML = `<div><div role="menu" data-state="open"></div></div>`;
		doc.body.append(portal);
		await flush();
		expect(isMarked()).toBe(true);

		portal.querySelector('[role="menu"]')?.setAttribute("data-state", "closed");
		await flush();
		expect(isMarked()).toBe(false);
	});

	test("clears the mark when the open dialog's portal is removed", async () => {
		const { doc, isMarked } = setup();
		const portal = doc.createElement("div");
		portal.innerHTML = `<div role="dialog" data-state="open"></div>`;
		doc.body.append(portal);
		stop = watchOpenOverlays(doc);
		expect(isMarked()).toBe(true);

		portal.remove();
		await flush();
		expect(isMarked()).toBe(false);
	});
});
