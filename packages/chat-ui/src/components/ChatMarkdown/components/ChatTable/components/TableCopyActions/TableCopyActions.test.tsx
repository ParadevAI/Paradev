import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TableCopyActions } = await import("./TableCopyActions");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("copies the table as Markdown and confirms", async () => {
	const written: string[] = [];
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async (text: string) => void written.push(text) },
	});
	const table = { current: document.createElement("table") };
	table.current.innerHTML =
		"<thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody>";
	const view = render(<TableCopyActions table={table} />);

	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Copy as Markdown" }));
		await new Promise((done) => setTimeout(done, 0));
	});
	expect(written).toEqual(["| A |\n| --- |\n| 1 |"]);
	expect(view.getByText("Copied")).toBeTruthy();
	expect(view.getByRole("button", { name: "Copy as CSV" })).toBeTruthy();
});

test("says so when the clipboard refuses the write", async () => {
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: async () => {
				throw new Error("Document is not focused");
			},
		},
	});
	const table = { current: document.createElement("table") };
	table.current.innerHTML = "<tbody><tr><td>1</td></tr></tbody>";
	const view = render(<TableCopyActions table={table} />);

	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Copy as CSV" }));
		await new Promise((done) => setTimeout(done, 0));
	});
	expect(view.getByText("Copy failed")).toBeTruthy();
	expect(view.getByRole("button", { name: "Copy as Markdown" })).toBeTruthy();
});
