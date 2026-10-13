import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileChangePreview } from "./FileChangePreview";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

const PATH = "/repo/packages/chat/src/app.ts";

/** The card leaves on a zero-delay timer, so one tick later is enough. */
async function closed() {
	for (
		let tick = 0;
		tick < 20 && screen.queryByText("Change preview");
		tick++
	) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}
const change = { kind: "modified" as const, path: PATH, name: "app.ts" };

function renderChip(
	status: ToolCall["status"],
	oldText: string,
	newText: string,
) {
	const onClick = mock(() => {});
	const view = render(
		<FileChangePreview
			change={change}
			closeDelay={0}
			content={{ type: "diff", path: PATH, oldText, newText }}
			onClick={onClick}
			openDelay={0}
			stats={{ additions: 1, deletions: 1 }}
			status={status}
		>
			app.ts
		</FileChangePreview>,
	);
	return { onClick, chip: view.getByRole("button", { name: "app.ts" }) };
}

test("the chip previews the edit on focus, and a click still reaches the row", async () => {
	const { chip, onClick } = renderChip("completed", "a\nb\nc\n", "a\nB\nc\n");
	expect(chip.title).toBe(PATH);

	chip.focus();
	const heading = await screen.findByText("Change preview");
	const card = heading.parentElement as HTMLElement;
	expect(card.textContent).toContain("/repo/packages/chat/src");
	expect(card.querySelector("img")?.getAttribute("src")).toContain(
		"file-icons/",
	);
	expect(
		[...card.querySelectorAll("[data-preview-line]")].map(
			(line) => `${line.getAttribute("data-preview-line")} ${line.textContent}`,
		),
	).toEqual(["context 1 a", "del 2−b", "add 2+B", "context 3 c"]);
	expect(card.textContent).toContain("+1");
	expect(card.textContent).toContain("−1");

	chip.blur();
	await closed();
	expect(screen.queryByText("Change preview")).toBeNull();

	chip.focus();
	await screen.findByText("Change preview");
	fireEvent.click(chip);
	expect(onClick).toHaveBeenCalledTimes(1);
	await closed();
	expect(screen.queryByText("Change preview")).toBeNull();
	chip.blur();

	// A click focuses the chip too; that focus must not bring the card back.
	fireEvent.pointerDown(chip);
	chip.focus();
	fireEvent.click(chip);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(screen.queryByText("Change preview")).toBeNull();
	expect(onClick).toHaveBeenCalledTimes(2);

	// A click on a chip that already has focus fires no focus event, and must
	// not swallow the next keyboard focus either.
	fireEvent.pointerDown(chip);
	fireEvent.click(chip);
	chip.blur();
	chip.focus();
	expect(await screen.findByText("Change preview")).toBeTruthy();
});

test("an edit that did not complete says so", async () => {
	const { chip } = renderChip("failed", "a\n", "b\n");
	chip.focus();
	expect(await screen.findByText("Attempted changes")).toBeTruthy();
});
