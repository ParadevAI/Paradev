import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { appendPastedText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { copySourceText } from "../../utils/copySourceText";
import { UserMessageRow } from "./UserMessageRow";

const TYPED = "Why does the usage notice crash here?";
const LOG = [
	"TypeError: Cannot read properties of undefined (reading 'resetsAtMs')",
	...Array.from(
		{ length: 47 },
		(_, index) => `    at frame${index} (x.js:${index}:1)`,
	),
].join("\n");

const writeText = mock(async (_text: string) => {});
const originalClipboard = navigator.clipboard;

beforeEach(() => {
	writeText.mockClear();
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText },
	});
});

afterEach(() => {
	cleanup();
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: originalClipboard,
	});
});

function message(text: string): UserMessage {
	return {
		id: "user-1",
		kind: "user_message",
		startedAtMs: 0,
		content: [{ type: "text", text }],
	};
}

function renderRow(text: string) {
	return render(
		<div data-testid="transcript" onCopy={copySourceText}>
			<UserMessageRow harness={undefined} item={message(text)} />
		</div>,
	);
}

test("a sent paste shows as a card beside the typed text, not in the bubble", () => {
	const view = renderRow(appendPastedText(TYPED, [LOG]));

	expect(view.getByText(TYPED)).toBeTruthy();
	expect(
		view.getByText(
			"TypeError: Cannot read properties of undefined (reading 'resetsAtMs')",
		),
	).toBeTruthy();
	expect(view.getByText("48 lines")).toBeTruthy();
	expect(view.container.textContent).not.toContain("pasted_text");
	expect(view.container.textContent).not.toContain("frame46");
});

test("Show text opens the paste read-only and Hide text folds it", () => {
	const view = renderRow(appendPastedText(TYPED, [LOG]));
	fireEvent.click(view.getByRole("button", { name: "Show text" }));

	const pre = view.container.querySelector("pre");
	expect(pre?.textContent).toBe(LOG);
	expect(
		view
			.getByRole("button", { name: "Hide text" })
			.getAttribute("aria-expanded"),
	).toBe("true");

	fireEvent.click(view.getByRole("button", { name: "Hide text" }));
	expect(view.container.querySelector("pre")).toBeNull();
});

test("Copy message gives the typed text and the paste, without the markup", async () => {
	const view = renderRow(appendPastedText(TYPED, [LOG, "second\npaste"]));
	fireEvent.click(view.getByRole("button", { name: "Copy message" }));

	await waitFor(() => expect(writeText).toHaveBeenCalled());
	expect(writeText.mock.calls[0]?.[0]).toBe(
		`${TYPED}\n\n${LOG}\n\nsecond\npaste`,
	);
});

test("a selection across the card copies the paste it stands for", () => {
	const view = renderRow(appendPastedText(TYPED, [LOG]));
	const transcript = view.getByTestId("transcript");
	const setData = mock((_type: string, _text: string) => {});

	window.getSelection()?.selectAllChildren(transcript);
	fireEvent.copy(transcript, { clipboardData: { setData } });

	const copied = setData.mock.calls[0]?.[1] ?? "";
	expect(copied).toContain(LOG);
	expect(copied).toContain(TYPED);
	expect(copied).not.toContain("Show text");
	expect(copied).not.toContain("48 lines");
});

test("a message that is only a paste has no empty bubble", () => {
	const view = renderRow(appendPastedText("", [LOG]));

	expect(
		view.container.querySelectorAll("[data-pasted-text-card]"),
	).toHaveLength(1);
	expect(view.container.querySelector(".whitespace-pre-wrap")).toBeNull();
});
