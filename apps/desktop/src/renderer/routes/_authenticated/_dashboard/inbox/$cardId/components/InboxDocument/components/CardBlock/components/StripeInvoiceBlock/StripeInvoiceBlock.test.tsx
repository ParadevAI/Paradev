import { stripeTestKit } from "../stripeTestKit";

const kit = await stripeTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../stripeFixtures");
const { StripeInvoiceBlock } = await import("./StripeInvoiceBlock");

type Props = Parameters<typeof StripeInvoiceBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(StripeInvoiceBlock, {
		view: fx.invoiceView,
		actions: fx.invoiceActions,
		...props,
	});
const amount = (block: ReturnType<typeof mount>, label: string) =>
	block.getByText(label).nextElementSibling?.textContent;

describe("invoice", () => {
	test("the invoice as Stripe sums it up", () => {
		const block = mount();
		expect(block.getByText("LUMEN-0042")).toBeTruthy();
		expect(block.getByText("Open")).toBeTruthy();
		expect(amount(block, "Team add-on (2 seats, yearly)")).toBe("$1,000.00");
		expect(amount(block, "Onboarding package")).toBe("$230.00");
		expect(amount(block, "Total")).toBe("$1,230.00");
		expect(amount(block, "Amount paid")).toBe("$0.00");
		expect(amount(block, "Amount due")).toBe("$1,230.00 USD");
		expect(amount(block, "Due date")).toBe("Nov 2, 2037");
		expect(amount(block, "Send to")).toBe("avery@example.com");
		expect(block.queryByText("Payment attempts")).toBeNull();
		expect(
			block
				.getAllByRole("link", { name: "Open in Stripe" })
				.map((link) => link.getAttribute("href")),
		).toContain(fx.openInvoice.url);
	});

	test.each([
		["Send again", "send", fx.SEND_CONFIRM],
		["Mark as paid", "mark_paid", fx.MARK_PAID_CONFIRM],
		["Void invoice", "void", fx.VOID_CONFIRM],
		["Mark uncollectible", "mark_uncollectible", fx.MARK_UNCOLLECTIBLE_CONFIRM],
	])("%s asks with the server's sentence", async (name, id, sentence) => {
		const block = mount();
		await block.click(name);
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(sentence);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([[id]]);
	});

	test("leave it", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("a draft has no number and only what is offered", () => {
		const block = mount({
			view: fx.draftInvoiceView,
			actions: fx.draftInvoiceActions,
		});
		expect(block.getAllByText("Draft").length).toBe(2);
		expect(block.button("Send invoice")).toBeTruthy();
		expect(block.queryByRole("button", { name: "Void invoice" })).toBeNull();
		expect(block.queryByRole("button", { name: "Mark as paid" })).toBeNull();
		expect(
			block.queryByRole("button", { name: "Mark uncollectible" }),
		).toBeNull();
	});

	const SANDBOX =
		"In sandbox mode, emails can only be sent to addresses with access to this sandbox.";

	test("a sandbox says who its emails reach", () => {
		expect(mount().getByText(SANDBOX)).toBeTruthy();
	});

	test("a live account does not", () => {
		const block = mount({
			view: { ...fx.invoiceView, account: fx.liveAccount },
		});
		expect(block.queryByText(SANDBOX)).toBeNull();
	});

	test("the reason an action is off", () => {
		const block = mount({
			view: { ...fx.invoiceView, invoice: fx.paidInvoice },
			actions: fx.invoiceActions.map((action) =>
				action.id === "dismiss"
					? action
					: { ...action, disabled: "This invoice is already paid" },
			),
		});
		expect(block.getAllByText("Paid").length).toBe(2);
		for (const name of [
			"Send again",
			"Mark as paid",
			"Mark uncollectible",
			"Void invoice",
		])
			expect(block.button(name).disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(false);
	});
});

describe("states", () => {
	test("settled: the facts stay and the controls go", () => {
		const block = mount({ done: true });
		expect(block.getByText("LUMEN-0042")).toBeTruthy();
		expect(
			block.queryByRole("button", { name: /Send|Mark|Void|Leave/ }),
		).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		for (const name of [
			"Send again",
			"Mark as paid",
			"Mark uncollectible",
			"Void invoice",
			"Leave it",
		])
			expect(block.button(name).disabled).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "Stripe did not send the invoice" });
		expect(block.getByRole("alert").textContent).toBe(
			"Stripe did not send the invoice",
		);
	});
});
