import { afterEach, expect, mock, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { TriggerSentence } = await import("../../TriggerSentence");
const { createLinearConfig } = await import("./grammar");

afterEach(cleanup);

test("Linear comment rows edit a command filter and expose the author", async () => {
	const onChange = mock(() => {});
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<TriggerSentence
				trigger={{
					id: "trigger",
					config: {
						...createLinearConfig("comment.created"),
						teams: { mode: "list", ids: ["team"] },
					},
				}}
				onChange={onChange}
				onRemove={() => {}}
				options={{
					linear: {
						teams: [{ id: "team", label: "Engineering" }],
						projects: [],
						labels: [],
						statuses: [],
						people: [{ id: "author", label: "Ada" }],
					},
				}}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	expect(ui.getByText("Comment added in")).toBeTruthy();
	expect(ui.getByRole("button", { name: "Anyone" })).toBeTruthy();
	await act(async () => {
		ui.getByRole("button", { name: "Any comment" }).click();
	});
	await act(async () => {
		fireEvent.change(ui.getByPlaceholderText("Contains this text..."), {
			target: { value: "/superset" },
		});
	});
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({
			config: expect.objectContaining({
				commentFilter: { pattern: "/superset", isRegex: false },
			}),
		}),
	);
});
