import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, mock, test } = await import("bun:test");
const fx = await import("../handoffFixtures");
const linear = await import("../linearFixtures");
const { LinearDraftEditor } = await import("./LinearDraftEditor");
const { draftValue } = await import("./utils/draftInput");

function mount(disabled = false) {
	const onChange = mock();
	const view = kit.render(
		<kit.TooltipProvider>
			<LinearDraftEditor
				draft={fx.bugDraft}
				value={draftValue(fx.bugDraft)}
				onChange={onChange}
				disabled={disabled}
			/>
		</kit.TooltipProvider>,
	);
	return { ...view, onChange };
}

describe("LinearDraftEditor", () => {
	test("shows the team by name and key, and the agent's draft", () => {
		const editor = mount();
		expect(editor.getByText("Agent Test")).toBeTruthy();
		expect(editor.getByText("AGT")).toBeTruthy();
		expect((editor.getByLabelText("Title") as HTMLInputElement).value).toBe(
			fx.bugDraft.title,
		);
		expect(editor.getByText("Todo")).toBeTruthy();
		expect(editor.getByText("Bug")).toBeTruthy();
	});

	test("a new title is reported with the rest unchanged", async () => {
		const editor = mount();
		await kit.act(async () => {
			kit.fireEvent.change(editor.getByLabelText("Title"), {
				target: { value: "Safari sign-in loop" },
			});
		});
		expect(editor.onChange.mock.calls).toEqual([
			[{ ...draftValue(fx.bugDraft), title: "Safari sign-in loop" }],
		]);
	});

	test("the description is edited as markdown", async () => {
		const editor = mount();
		await kit.act(async () => {
			kit.fireEvent.click(editor.getByRole("button", { name: "Edit" }));
		});
		await kit.act(async () => {
			kit.fireEvent.change(editor.getByLabelText("Description"), {
				target: { value: "Only on Safari." },
			});
		});
		expect(editor.onChange.mock.calls[0]?.[0]).toMatchObject({
			description: "Only on Safari.",
		});
	});

	test("a picked property is reported", async () => {
		const editor = mount();
		await kit.act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			kit.fireEvent.click(
				editor.getByRole("button", { name: "Assignee" }) as HTMLElement,
			);
		});
		await kit.option(/Marcus Oyelaran/);
		expect(editor.onChange.mock.calls[0]?.[0].fields).toEqual({
			...fx.bugDraft.fields,
			assignee: linear.marcus.id,
		});
	});

	test("disabled: nothing can be changed", () => {
		const editor = mount(true);
		expect((editor.getByLabelText("Title") as HTMLInputElement).disabled).toBe(
			true,
		);
		expect(
			(editor.getByRole("button", { name: "Edit" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
