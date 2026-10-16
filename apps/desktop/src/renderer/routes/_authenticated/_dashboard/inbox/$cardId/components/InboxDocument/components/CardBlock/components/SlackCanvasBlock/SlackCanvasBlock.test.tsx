import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../slackApprovalFixtures");
const { SlackCanvasBlock } = await import("./SlackCanvasBlock");

type Props = Parameters<typeof SlackCanvasBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(SlackCanvasBlock, {
		view: fx.canvasView,
		actions: fx.canvasActions,
		...props,
	});
const diff = (block: ReturnType<typeof mount>) =>
	[...block.container.querySelectorAll("[data-diff]")].map(
		(line) =>
			`${line.getAttribute("data-diff")} ${line.lastElementChild?.textContent}`,
	);

describe("a change to a canvas", () => {
	test("a replacement is a diff, applied with what the reader saw", async () => {
		const block = mount();
		expect(block.getByText("Launch checklist")).toBeTruthy();
		expect(block.getByText("Replace")).toBeTruthy();
		expect(
			block.getByRole("link", { name: "Open in Slack" }).getAttribute("href"),
		).toBe(fx.canvasView.canvas.url);
		expect(diff(block)).toEqual([
			"removed Owner: Riley",
			"added Owner: Riley (backup: the on-call lead)",
		]);
		await block.click("Apply to canvas");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe('Change "Launch checklist" in Slack?');
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{
					markdown: "Owner: Riley (backup: the on-call lead)",
					section: fx.canvasView.section,
					before: "Owner: Riley",
					version: fx.canvasView.version,
				},
			],
		]);
	});

	test("an insertion shows the part it follows, unchanged", () => {
		const block = mount({ view: fx.canvasInsertView });
		expect(block.getByText("Add after")).toBeTruthy();
		expect(diff(block)).toEqual([
			"same Owner: Riley",
			"added Backup: the on-call lead",
		]);
	});

	test("an addition at the end follows the canvas's last line", async () => {
		const block = mount({ view: fx.canvasAppendView });
		expect(block.getByText("Add at the end")).toBeTruthy();
		expect(diff(block).map((line) => line.trim())).toEqual([
			"same See [the plan](https://example.com) and `inline`.",
			"added ## Follow-ups",
			"added",
			"added - Send the recap",
		]);
		await block.click("Apply to canvas");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			markdown: "## Follow-ups\n\n- Send the recap",
			section: null,
			before: null,
			version: fx.canvasView.version,
		});
	});

	test("a removal has no text to edit", async () => {
		const block = mount({ view: fx.canvasDeleteView });
		expect(block.getByText("Remove")).toBeTruthy();
		expect(diff(block)).toEqual([
			"same - Tell support",
			"removed Owner: Riley",
		]);
		expect(block.queryByRole("button", { name: "Edit" })).toBeNull();
		await block.click("Apply to canvas");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			markdown: "",
			section: fx.canvasView.section,
			before: "Owner: Riley",
			version: fx.canvasView.version,
		});
	});

	test("the reader's edit is what is applied, and the diff follows it", async () => {
		const block = mount();
		await block.click("Edit");
		await block.type("New text", "Owner: Avery");
		await block.click("Done");
		expect(diff(block)).toEqual(["removed Owner: Riley", "added Owner: Avery"]);
		await block.click("Apply to canvas");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({
			markdown: "Owner: Avery",
		});
	});

	test("no text left: the button is off", async () => {
		const block = mount();
		await block.click("Edit");
		await block.type("New text", "  ");
		expect(block.button("Apply to canvas").disabled).toBe(true);
	});

	test("the whole canvas opens under the change", async () => {
		const block = mount();
		expect(block.queryByText("Risks")).toBeNull();
		await block.click("Show the whole canvas");
		expect(block.getByRole("heading", { name: "Risks" })).toBeTruthy();
		expect(block.getByText("Pricing page is not updated")).toBeTruthy();
	});

	test("leave the canvas", async () => {
		const block = mount();
		await block.click("Leave the canvas");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("states", () => {
	test("a canvas the reader can only read: off for the server's reason", () => {
		const block = mount({
			view: { ...fx.canvasView, editable: false },
			actions: fx.off(fx.canvasActions, "apply", fx.READ_ONLY_CANVAS),
		});
		expect(block.button("Apply to canvas").disabled).toBe(true);
		expect(block.button("Leave the canvas").disabled).toBe(false);
	});

	test("settled: the change stays and the controls go", () => {
		const block = mount({ done: true });
		expect(diff(block)).toHaveLength(2);
		expect(block.queryByRole("button", { name: "Edit" })).toBeNull();
		expect(block.queryByRole("button", { name: "Apply to canvas" })).toBeNull();
		expect(
			block.queryByRole("button", { name: "Leave the canvas" }),
		).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Apply to canvas").disabled).toBe(true);
		expect(block.button("Leave the canvas").disabled).toBe(true);
		expect(block.button("Edit").disabled).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({
			failure:
				"This canvas was edited since you looked. Read it again before you apply",
		});
		expect(block.getByRole("alert").textContent).toBe(
			"This canvas was edited since you looked. Read it again before you apply",
		);
	});
});
