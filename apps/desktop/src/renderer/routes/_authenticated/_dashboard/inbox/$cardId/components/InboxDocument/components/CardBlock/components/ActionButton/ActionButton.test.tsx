import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, expect, mock, test } = await import("bun:test");
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { ConfirmEchoProvider } = await import(
	"../../providers/ConfirmEchoProvider"
);
const { ActionButton } = await import("./ActionButton");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const action = (confirm: string) => ({
	id: "void",
	label: "Void invoice",
	style: "danger" as const,
	role: "other" as const,
	confirm,
});

const question = () =>
	document.body.querySelector("[data-slot='alert-dialog-description']")
		?.textContent ?? null;

test("the sentence the dialog opened with is the one shown and the one reported, even when the card is read again under it", async () => {
	const shown = mock();
	const onClick = mock();
	const tree = (confirm: string) => (
		<ConfirmEchoProvider onShown={shown}>
			<ActionButton action={action(confirm)} pending={false} onClick={onClick}>
				Void invoice
			</ActionButton>
		</ConfirmEchoProvider>
	);
	const view = render(tree("Void INV-1 for $20.00?"));
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Void invoice" }));
	});
	expect(question()).toBe("Void INV-1 for $20.00?");
	view.rerender(tree("Void INV-1 for $2,000.00?"));
	expect(question()).toBe("Void INV-1 for $20.00?");
	expect(shown.mock.calls).toEqual([["void", "Void INV-1 for $20.00?"]]);
	expect(onClick).not.toHaveBeenCalled();
});
