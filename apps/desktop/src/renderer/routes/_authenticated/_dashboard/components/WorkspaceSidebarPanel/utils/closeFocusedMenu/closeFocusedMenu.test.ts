import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeFocusedMenu } from "./closeFocusedMenu";

let keys: string[] = [];
const record = (event: KeyboardEvent) => keys.push(event.key);

beforeEach(() => {
	keys = [];
	document.addEventListener("keydown", record, true);
});

afterEach(() => {
	document.removeEventListener("keydown", record, true);
	document.body.innerHTML = "";
});

function focusButton({ inMenu }: { inMenu: boolean }) {
	const host = document.createElement("div");
	if (inMenu) host.setAttribute("role", "menu");
	const button = document.createElement("button");
	host.append(button);
	document.body.append(host);
	button.focus();
}

describe("closeFocusedMenu", () => {
	test("sends Escape from the focused menu item", () => {
		focusButton({ inMenu: true });
		closeFocusedMenu();
		expect(keys).toEqual(["Escape"]);
	});

	test("sends nothing when focus is outside a menu", () => {
		focusButton({ inMenu: false });
		closeFocusedMenu();
		expect(keys).toEqual([]);
	});
});
