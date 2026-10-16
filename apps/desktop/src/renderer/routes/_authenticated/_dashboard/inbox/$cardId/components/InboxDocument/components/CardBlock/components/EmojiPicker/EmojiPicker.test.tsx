import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, test } = await import(
	"bun:test"
);
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { EmojiPicker } = await import("./EmojiPicker");

afterEach(() => {
	cleanup();
	localStorage.clear();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function mount() {
	const onPick = mock();
	const view = render(
		<EmojiPicker
			emoji={{ shipit: "https://example.com/shipit.png" }}
			workspaceUrl="https://acme.slack.com"
			onPick={onPick}
		/>,
	);
	const search = view.container.querySelector("input") as HTMLInputElement;
	const headings = () =>
		[...view.container.querySelectorAll("h3")].map((h) => h.textContent);
	const footer = () =>
		view.container.querySelector(".border-t")?.textContent ?? "";
	return { ...view, onPick, search, headings, footer };
}

describe("the emoji picker is Slack's", () => {
	test("sections in Slack's order, ending with the workspace's own", () => {
		const { headings } = mount();
		expect(headings()).toEqual([
			"Frequently Used",
			"Getting Work Done",
			"Smileys & People",
			"Animals & Nature",
			"Food & Drink",
			"Travel & Places",
			"Activities",
			"Objects",
			"Symbols",
			"Flags",
			"Custom",
		]);
	});

	test("one tab per category after search, as Slack's row has", () => {
		const { container } = mount();
		expect(
			[...container.querySelectorAll("[role=tab]")].map((t) =>
				t.getAttribute("aria-label"),
			),
		).toEqual([
			"Search",
			"Smileys & People",
			"Animals & Nature",
			"Food & Drink",
			"Travel & Places",
			"Activities",
			"Objects",
			"Symbols",
			"Flags",
			"Custom",
		]);
	});

	test("the search box has focus, and typing shows Search results with the first one previewed", async () => {
		const { search, headings, footer } = mount();
		expect(document.activeElement).toBe(search);
		await act(async () => {
			fireEvent.change(search, { target: { value: "thu" } });
		});
		expect(headings()).toEqual(["Search results"]);
		expect(footer()).toContain(":+1:");
	});

	test("Enter in the search box picks the first result, with Slack's name", async () => {
		const { search, onPick } = mount();
		await act(async () => {
			fireEvent.change(search, { target: { value: "rage" } });
			fireEvent.keyDown(search, { key: "Enter" });
		});
		expect(onPick.mock.calls[0]?.[0]).toMatchObject({ reaction: "rage" });
	});

	test("↓ moves into the grid, arrows move by cell and row, Enter picks", async () => {
		const { search, container, onPick } = mount();
		await act(async () => fireEvent.keyDown(search, { key: "ArrowDown" }));
		const focused = () => document.activeElement as HTMLElement;
		expect(focused().dataset.cell).toBe("0");
		await act(async () => fireEvent.keyDown(focused(), { key: "ArrowRight" }));
		expect(focused().dataset.cell).toBe("1");
		await act(async () => fireEvent.keyDown(focused(), { key: "ArrowDown" }));
		expect(focused().dataset.cell).toBe("10");
		await act(async () => fireEvent.keyDown(focused(), { key: "ArrowUp" }));
		await act(async () => fireEvent.keyDown(focused(), { key: "ArrowUp" }));
		expect(document.activeElement).toBe(container.querySelector("input"));
		await act(async () => fireEvent.keyDown(search, { key: "ArrowDown" }));
		await act(async () => fireEvent.click(focused()));
		expect(onPick.mock.calls[0]?.[0]).toMatchObject({
			reaction: "white_check_mark",
		});
	});

	test("hovering previews the emoji in the footer; Add Emoji shows otherwise", async () => {
		const { container, footer } = mount();
		expect(footer()).toContain("Add Emoji");
		const heart = container.querySelector(
			'[aria-label="heart"]',
		) as HTMLElement;
		await act(async () => fireEvent.mouseEnter(heart));
		expect(footer()).toContain(":heart:");
		expect(footer()).not.toContain("Add Emoji");
	});

	test("a skin tone shows on the grid and goes into the reaction name", async () => {
		const { container, onPick, footer } = mount();
		const toneButton = container.querySelector(
			'[aria-label="Choose your default skin tone"]',
		) as HTMLElement;
		await act(async () => fireEvent.click(toneButton));
		const tones = [...document.body.querySelectorAll("[aria-pressed]")];
		expect(tones).toHaveLength(6);
		await act(async () => fireEvent.click(tones[3] as HTMLElement));
		expect(footer()).toContain("✋🏽");
		const thumbs = container.querySelector('[aria-label="+1"]') as HTMLElement;
		expect(thumbs.textContent).toBe("👍🏽");
		await act(async () => fireEvent.click(thumbs));
		expect(onPick.mock.calls[0]?.[0]).toMatchObject({
			reaction: "+1::skin-tone-4",
			toned: "👍🏽",
		});
	});
});
