import { afterEach, describe, expect, mock, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { getDispatchChord, useHotkey } = await import("renderer/hotkeys");
type HotkeyId = import("renderer/hotkeys").HotkeyId;
const { PaneAreaProvider, usePaneAreaHotkeyGuard } = await import(
	"./PaneAreaProvider"
);
type PaneArea = import("./PaneAreaProvider").PaneArea;

afterEach(cleanup);

function FindHotkey({ id, onFind }: { id: HotkeyId; onFind: () => void }) {
	const ignoreOtherPaneArea = usePaneAreaHotkeyGuard();
	useHotkey(id, onFind, { ignoreEventWhen: ignoreOtherPaneArea });
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

describe("PaneAreaProvider", () => {
	test("one find shortcut reaches only the pane area the reader is in", () => {
		let focused: PaneArea = "center";
		const focusedArea = () => focused;
		const chat = mock(() => {});
		const page = mock(() => {});
		render(
			<>
				<PaneAreaProvider area="center" focusedArea={focusedArea}>
					<FindHotkey id="FIND_IN_CHAT" onFind={chat} />
				</PaneAreaProvider>
				<PaneAreaProvider area="right" focusedArea={focusedArea}>
					<FindHotkey id="FIND_IN_PAGE" onFind={page} />
				</PaneAreaProvider>
			</>,
		);

		pressFind();
		expect([chat.mock.calls.length, page.mock.calls.length]).toEqual([1, 0]);

		focused = "right";
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
