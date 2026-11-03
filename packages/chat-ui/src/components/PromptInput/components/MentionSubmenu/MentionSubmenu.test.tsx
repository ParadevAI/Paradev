import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ComposerMentionEntry } from "../../types";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { MentionSubmenu } = await import("./MentionSubmenu");

afterEach(cleanup);

const settle = () => act(async () => {});
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

const issue = (id: string): ComposerMentionEntry => ({
	id,
	label: id,
	select: () => {},
});

function renderSubmenu() {
	const search = mock(async (query: string, _signal: AbortSignal) =>
		[issue("ENG-1"), issue("ENG-2")].filter((entry) =>
			entry.id.includes(query),
		),
	);
	const handlers = {
		onSelect: mock((_entry: ComposerMentionEntry) => {}),
		onBack: mock(() => {}),
		onClose: mock(() => {}),
	};
	const view = render(
		<MentionSubmenu
			provider={{
				id: "linear-issues",
				title: "Linear issues",
				priority: 3,
				browse: {
					label: "Linear issues",
					placeholder: "Search Linear…",
				},
				source: { kind: "search", emptyState: "No matching issues", search },
			}}
			{...handlers}
		/>,
	);
	const input = view.getByPlaceholderText("Search Linear…") as HTMLInputElement;
	const rows = () =>
		view.queryAllByRole("option").map((row) => row.textContent);
	return { view, input, rows, search, ...handlers };
}

test("lists results before typing, searches as you type, and picks with the keyboard", async () => {
	const { view, input, rows, onSelect } = renderSubmenu();
	expect(view.getByRole("dialog", { name: "Linear issues" })).toBeTruthy();
	expect(document.activeElement).toBe(input);
	await settle();
	expect(rows()).toEqual(["ENG-1", "ENG-2"]);

	fireEvent.change(input, { target: { value: "2" } });
	await settle();
	expect(rows()).toEqual(["ENG-2"]);

	fireEvent.change(input, { target: { value: "" } });
	await settle();
	expect(rows()).toHaveLength(2);
	fireEvent.keyDown(input, { key: "ArrowDown" });
	fireEvent.keyDown(input, { key: "Enter" });
	expect(onSelect.mock.calls[0]?.[0].id).toBe("ENG-2");
});

test("left arrow at the start goes back and escape closes", async () => {
	const { input, rows, onBack, onClose } = renderSubmenu();
	await settle();
	expect(rows()).toHaveLength(2);
	fireEvent.change(input, { target: { value: "x" } });
	await settle();
	expect(rows()).toEqual([]);
	input.setSelectionRange(1, 1);
	fireEvent.keyDown(input, { key: "ArrowLeft" });
	expect(onBack).not.toHaveBeenCalled();
	input.setSelectionRange(0, 0);
	fireEvent.keyDown(input, { key: "ArrowLeft" });
	expect(onBack).toHaveBeenCalledTimes(1);
	fireEvent.keyDown(input, { key: "Escape" });
	expect(onClose).toHaveBeenCalledTimes(1);
});
