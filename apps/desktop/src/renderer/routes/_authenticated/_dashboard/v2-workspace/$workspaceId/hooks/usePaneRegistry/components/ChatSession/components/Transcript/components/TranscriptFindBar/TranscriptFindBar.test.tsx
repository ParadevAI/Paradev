import { afterEach, expect, mock, test } from "bun:test";
import { createRef } from "react";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TranscriptFindBar } = await import("./TranscriptFindBar");
type Props = import("./TranscriptFindBar").TranscriptFindBarProps;

afterEach(cleanup);

function renderBar(overrides: Partial<Props> = {}) {
	const handlers = {
		onQueryChange: mock(() => {}),
		onNext: mock(() => {}),
		onPrevious: mock(() => {}),
		onClose: mock(() => {}),
	};
	const view = render(
		<TranscriptFindBar
			currentIndex={1}
			inputRef={createRef<HTMLInputElement>()}
			isOpen
			loading={false}
			matchCount={12}
			query="login"
			{...handlers}
			{...overrides}
		/>,
	);
	return { ...view, ...handlers };
}

test("shows the position and steps with Enter and Shift+Enter", () => {
	const { getByRole, getByText, onNext, onPrevious } = renderBar();
	const input = getByRole("textbox");
	expect(document.activeElement).toBe(input);
	expect(getByText("2 of 12")).toBeTruthy();

	fireEvent.keyDown(input, { key: "Enter" });
	fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
	expect(onNext).toHaveBeenCalledTimes(1);
	expect(onPrevious).toHaveBeenCalledTimes(1);
});

test("the icon buttons are named and act on click", () => {
	const { getByRole, onNext, onPrevious, onClose } = renderBar();
	fireEvent.click(getByRole("button", { name: "Previous (Shift+Enter)" }));
	fireEvent.click(getByRole("button", { name: "Next (Enter)" }));
	fireEvent.click(getByRole("button", { name: "Close (Esc)" }));
	expect(onPrevious).toHaveBeenCalledTimes(1);
	expect(onNext).toHaveBeenCalledTimes(1);
	expect(onClose).toHaveBeenCalledTimes(1);
});

test("Esc closes the bar", () => {
	const { getByRole, onClose } = renderBar();
	fireEvent.keyDown(getByRole("textbox"), { key: "Escape" });
	expect(onClose).toHaveBeenCalledTimes(1);
});

test("a query with no hits says so, unless older pages are still loading", () => {
	const empty = renderBar({ matchCount: 0, currentIndex: -1 });
	expect(empty.getByText("No results")).toBeTruthy();
	cleanup();
	const loading = renderBar({ matchCount: 0, currentIndex: -1, loading: true });
	expect(loading.getByText("Loading…")).toBeTruthy();
});

test("Esc closes after keyboard focus moves to a navigation button", () => {
	const { getByRole, onClose, onNext } = renderBar();
	const next = getByRole("button", { name: "Next (Enter)" });
	act(() => next.focus());
	fireEvent.click(next);
	fireEvent.keyDown(next, { key: "Escape" });
	expect(onNext).toHaveBeenCalledTimes(1);
	expect(onClose).toHaveBeenCalledTimes(1);
});
