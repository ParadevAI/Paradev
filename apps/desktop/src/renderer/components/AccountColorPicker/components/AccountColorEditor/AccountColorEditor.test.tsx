import { afterEach, expect, mock, test } from "bun:test";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { AccountColorEditor } = await import("./AccountColorEditor");
afterEach(cleanup);

test("native full-spectrum selection and hex edits save only on explicit submission", () => {
	const save = mock(() => {});
	const page = render(
		<AccountColorEditor color="green" dark saving={false} onSave={save} />,
	);
	const picker = page.getByLabelText("Color") as HTMLInputElement;
	const hex = page.getByLabelText("Hex color") as HTMLInputElement;
	expect(picker.type).toBe("color");
	expect(picker.value).toBe("#4ade80");
	fireEvent.change(picker, { target: { value: "#a1b2c3" } });
	expect(hex.value).toBe("#a1b2c3");
	expect(save).not.toHaveBeenCalled();
	fireEvent.click(page.getByRole("button", { name: "Save" }));
	expect(save).toHaveBeenCalledTimes(1);
	expect(save).toHaveBeenCalledWith("#a1b2c3");
});

test("invalid hex cannot submit and a corrected non-preset value can", () => {
	const save = mock(() => {});
	const page = render(
		<AccountColorEditor
			color={null}
			dark={false}
			saving={false}
			onSave={save}
		/>,
	);
	const hex = page.getByLabelText("Hex color") as HTMLInputElement;
	fireEvent.change(hex, { target: { value: "url(secret)" } });
	expect(hex.getAttribute("aria-invalid")).toBe("true");
	expect(page.getByRole("alert").textContent).toContain("six-digit hex");
	expect(
		(page.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled,
	).toBe(true);
	fireEvent.submit(hex.closest("form") as HTMLFormElement);
	expect(save).not.toHaveBeenCalled();
	fireEvent.change(hex, { target: { value: "17BBcc" } });
	fireEvent.blur(hex);
	expect(hex.value).toBe("#17bbcc");
	expect(page.queryByRole("alert")).toBeNull();
	fireEvent.click(page.getByRole("button", { name: "Save" }));
	expect(save).toHaveBeenCalledWith("#17bbcc");
});

test("pending writes disable editing and default restores the provider color", () => {
	const save = mock(() => {});
	const page = render(
		<AccountColorEditor color="#010203" dark saving onSave={save} />,
	);
	expect((page.getByLabelText("Color") as HTMLInputElement).disabled).toBe(
		true,
	);
	expect((page.getByLabelText("Hex color") as HTMLInputElement).disabled).toBe(
		true,
	);
	fireEvent.click(page.getByRole("button", { name: "Default color" }));
	expect(save).not.toHaveBeenCalled();
	page.rerender(
		<AccountColorEditor color="#010203" dark saving={false} onSave={save} />,
	);
	fireEvent.click(page.getByRole("button", { name: "Default color" }));
	expect(save).toHaveBeenCalledWith(null);
});
