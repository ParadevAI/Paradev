import { afterEach, describe, expect, mock, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { PaneAreaFocusedContext } = await import("@superset/panes");
const { getDispatchChord, useHotkey } = await import("renderer/hotkeys");
type HotkeyId = import("renderer/hotkeys").HotkeyId;
const { usePaneHotkeyEnabled } = await import("./usePaneHotkeyEnabled");

afterEach(cleanup);

function FindHotkey({ id, onFind }: { id: HotkeyId; onFind: () => void }) {
	useHotkey(id, onFind, { enabled: usePaneHotkeyEnabled(true) });
	return null;
}

function pressFind() {
	const parts = (getDispatchChord("FIND_IN_PAGE") ?? "").split("+");
	const letter = parts.at(-1) ?? "";
	const init: KeyboardEventInit = {
		key: letter,
		code: `Key${letter.toUpperCase()}`,
		metaKey: parts.includes("meta"),
		ctrlKey: parts.includes("ctrl"),
		shiftKey: parts.includes("shift"),
		altKey: parts.includes("alt"),
		bubbles: true,
		cancelable: true,
	};
	act(() => {
		document.dispatchEvent(new KeyboardEvent("keydown", init));
		document.dispatchEvent(new KeyboardEvent("keyup", init));
	});
}

function Areas({
	rightFocused,
	chat,
	page,
}: {
	rightFocused: boolean;
	chat: () => void;
	page: () => void;
}) {
	return (
		<>
			<PaneAreaFocusedContext.Provider value={!rightFocused}>
				<FindHotkey id="FIND_IN_CHAT" onFind={chat} />
			</PaneAreaFocusedContext.Provider>
			<PaneAreaFocusedContext.Provider value={rightFocused}>
				<FindHotkey id="FIND_IN_PAGE" onFind={page} />
			</PaneAreaFocusedContext.Provider>
		</>
	);
}

describe("usePaneHotkeyEnabled", () => {
	test("one find shortcut reaches only the pane area the reader is in", () => {
		const chat = mock(() => {});
		const page = mock(() => {});
		const view = render(<Areas rightFocused={false} chat={chat} page={page} />);

		pressFind();
		expect([chat.mock.calls.length, page.mock.calls.length]).toEqual([1, 0]);

		view.rerender(<Areas rightFocused chat={chat} page={page} />);
		pressFind();
		expect([chat.mock.calls.length, page.mock.calls.length]).toEqual([1, 1]);
	});

	test("a pane outside any pane area keeps its hotkey", () => {
		const page = mock(() => {});
		render(<FindHotkey id="FIND_IN_PAGE" onFind={page} />);
		pressFind();
		expect(page).toHaveBeenCalledTimes(1);
	});
});
