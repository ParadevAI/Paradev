import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, test } = await import(
	"bun:test"
);
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { useState } = await import("react");
const { TooltipProvider } = await import("@superset/ui/tooltip");
const { RecipientField } = await import("./RecipientField");

import type { GmailAddress } from "../../types";

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function Fields() {
	const [to, setTo] = useState<GmailAddress[]>([]);
	const [cc, setCc] = useState<GmailAddress[]>([]);
	return (
		<TooltipProvider>
			<RecipientField label="To" value={to} onChange={setTo} known={[]} />
			<RecipientField label="Cc" value={cc} onChange={setCc} known={[]} />
		</TooltipProvider>
	);
}

function mount() {
	const view = render(<Fields />);
	const inputs = [...view.container.querySelectorAll("input")];
	const rows = inputs.map((i) => i.closest("div.relative") as HTMLElement);
	const chips = (row: number) =>
		[
			...(rows[row]?.querySelectorAll("button[aria-label^='Remove ']") ?? []),
		].map((b) => b.parentElement?.textContent?.trim());
	const type = async (row: number, text: string) => {
		const input = inputs[row] as HTMLInputElement;
		await act(async () => {
			fireEvent.change(input, { target: { value: text } });
			fireEvent.keyDown(input, { key: "Enter" });
		});
	};
	const key = async (row: number, k: string) =>
		act(async () => {
			fireEvent.keyDown(inputs[row] as HTMLInputElement, { key: k });
		});
	return { ...view, inputs, rows, chips, type, key };
}

describe("RecipientField, as Gmail's recipient line", () => {
	test("Backspace selects the last chip first, and removes it on the second press", async () => {
		const field = mount();
		await field.type(0, "one@example.com");
		await field.type(0, "two@example.com");
		await field.key(0, "Backspace");
		expect(field.chips(0)).toEqual(["one@example.com", "two@example.com"]);
		await field.key(0, "Backspace");
		expect(field.chips(0)).toEqual(["one@example.com"]);
	});

	test("an address already there stays in the field, as Gmail leaves it", async () => {
		const field = mount();
		await field.type(0, "one@example.com");
		await field.type(0, "one@example.com");
		expect(field.chips(0)).toEqual(["one@example.com"]);
		expect((field.inputs[0] as HTMLInputElement).value).toBe("one@example.com");
	});

	test("a name the reader typed shows on the chip", async () => {
		const field = mount();
		await field.type(0, "Avery <avery@example.com>");
		expect(field.chips(0)).toEqual(["Avery"]);
	});

	test("a chip dragged from To to Cc moves there", async () => {
		const field = mount();
		await field.type(0, "Avery <avery@example.com>");
		const chip = field.rows[0]?.querySelector("[draggable]") as HTMLElement;
		const data = new Map<string, string>();
		const dataTransfer = {
			setData: (type: string, value: string) => data.set(type, value),
			getData: (type: string) => data.get(type) ?? "",
			get types() {
				return [...data.keys()];
			},
			dropEffect: "none",
			effectAllowed: "all",
		};
		await act(async () => {
			fireEvent.dragStart(chip, { dataTransfer });
			fireEvent.dragOver(field.rows[1] as HTMLElement, { dataTransfer });
			fireEvent.drop(field.rows[1] as HTMLElement, { dataTransfer });
			fireEvent.dragEnd(chip, {
				dataTransfer: { ...dataTransfer, dropEffect: "move" },
			});
		});
		expect(field.chips(0)).toEqual([]);
		expect(field.chips(1)).toEqual(["Avery"]);
	});
});
