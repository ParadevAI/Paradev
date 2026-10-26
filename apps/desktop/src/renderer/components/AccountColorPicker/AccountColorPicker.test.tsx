import { afterEach, expect, mock, test } from "bun:test";

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { AccountColorPicker } = await import("./AccountColorPicker");
afterEach(cleanup);

test("a controlled picker submits custom color and exposes a recoverable failure", async () => {
	let fail = true;
	const save = mock(async () => {
		if (fail) throw new Error("fixture failure");
	});
	const open = mock((_value: boolean) => {});
	const view = render(
		<AccountColorPicker
			accountLabel="Studio"
			color={null}
			dark
			onSave={save}
			onOpenChange={open}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Account color · Studio" }));
	expect(open).toHaveBeenCalledWith(true);
	fireEvent.change(view.getByLabelText("Hex color"), {
		target: { value: "#17bbcc" },
	});
	expect(save).not.toHaveBeenCalled();
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Save" }));
	});
	expect(save).toHaveBeenCalledWith("#17bbcc");
	expect(view.getByRole("alert").textContent).toBe(
		"Could not save account color.",
	);
	expect(view.getByLabelText("Hex color")).toBeDefined();
	expect(open.mock.calls).toEqual([[true]]);
	fail = false;
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Save" }));
	});
	expect(save).toHaveBeenCalledTimes(2);
	expect(view.queryByLabelText("Hex color")).toBeNull();
	expect(open.mock.calls).toEqual([[true], [false]]);
});
