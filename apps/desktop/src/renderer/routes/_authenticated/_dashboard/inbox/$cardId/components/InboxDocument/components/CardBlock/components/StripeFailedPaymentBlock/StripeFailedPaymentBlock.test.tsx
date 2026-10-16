import { stripeTestKit } from "../stripeTestKit";

const kit = await stripeTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../stripeFixtures");
const { StripeFailedPaymentBlock } = await import("./StripeFailedPaymentBlock");

type Props = Parameters<typeof StripeFailedPaymentBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(StripeFailedPaymentBlock, {
		view: fx.failedPaymentView,
		actions: fx.failedPaymentActions,
		...props,
	});
const { email, invoice } = fx.failedPaymentView;
const fact = (block: ReturnType<typeof mount>, label: string) =>
	block.getByText(label).nextElementSibling?.textContent;

describe("failed payment", () => {
	test("the invoice and why the payment failed", () => {
		const block = mount();
		expect(block.getByText("LUMEN-0041")).toBeTruthy();
		expect(block.getByText("Amount due").nextElementSibling?.textContent).toBe(
			"$20.00 USD",
		);
		expect(fact(block, "Payment attempts")).toBe("2");
		expect(fact(block, "Next attempt")).toBe("Oct 8, 2037");
		expect(fact(block, "Decline reason")).toBe(
			"Your card has insufficient funds.",
		);
		expect(fact(block, "Payment method")).toBe("Mastercard •••• 444404 / 2039");
	});

	test("a payment method with no expiry shows none", () => {
		const block = mount({
			view: {
				...fx.failedPaymentView,
				charged: { brand: "mastercard", last4: "4444" },
			},
		});
		expect(fact(block, "Payment method")).toBe("Mastercard •••• 4444");
	});

	test("charge customer asks with the server's sentence", async () => {
		const block = mount();
		await block.click("Charge customer");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(fx.RETRY_CONFIRM);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["retry"]]);
	});

	test("the drafted email, with the payment link as its last line", async () => {
		const block = mount();
		expect(block.getByText("To devon@example.com")).toBeTruthy();
		expect((block.getByLabelText("Subject") as HTMLInputElement).value).toBe(
			email.subject,
		);
		expect((block.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
			email.draft,
		);
		const link = block.getByRole("link", { name: invoice.hostedUrl as string });
		expect(link.getAttribute("href")).toBe(invoice.hostedUrl);
		expect(link.previousElementSibling).toBe(block.getByLabelText("Message"));

		await block.click("Send update-card link");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			"Email the payment link for $20.00 to devon@example.com?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["send_link", { subject: email.subject, text: email.draft }],
		]);
	});

	test("an edited subject and message", async () => {
		const block = mount();
		await block.type("Subject", " Payment failed ");
		await block.type("Message", "Please update your card.\n");
		await block.click("Send update-card link");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"send_link",
				{ subject: "Payment failed", text: "Please update your card." },
			],
		]);
	});

	test("an empty subject or message cannot be sent", async () => {
		const block = mount();
		await block.type("Subject", " ");
		expect(block.button("Send update-card link").disabled).toBe(true);
		await block.type("Subject", "Payment failed");
		await block.type("Message", "");
		expect(block.button("Send update-card link").disabled).toBe(true);
	});

	test("Gmail not connected: the email is off for the server's reason", () => {
		const block = mount({
			actions: fx.failedPaymentActions.map((action) =>
				action.id === "send_link"
					? { ...action, disabled: "Connect Gmail to email the customer" }
					: action,
			),
		});
		expect(block.button("Send update-card link").disabled).toBe(true);
		expect((block.getByLabelText("Subject") as HTMLInputElement).disabled).toBe(
			true,
		);
		expect(block.button("Charge customer").disabled).toBe(false);
	});

	test("the link is for what is left to pay", async () => {
		const block = mount({
			view: {
				...fx.failedPaymentView,
				invoice: { ...invoice, amountPaid: 500, amountRemaining: 1500 },
				charged: null,
			},
		});
		expect(block.getByText("Amount due").nextElementSibling?.textContent).toBe(
			"$15.00 USD",
		);
		expect(block.queryByText("Payment method")).toBeNull();
		await block.click("Send update-card link");
		expect(block.question()).toBe(
			"Email the payment link for $15.00 to devon@example.com?",
		);
	});

	test("leave it", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("states", () => {
	test("settled: the facts stay and the controls go", () => {
		const block = mount({ done: true });
		expect(block.getByText("LUMEN-0041")).toBeTruthy();
		expect(block.queryByLabelText("Subject")).toBeNull();
		expect(
			block.queryByRole("button", { name: /Charge|Send|Leave/ }),
		).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		for (const name of ["Charge customer", "Send update-card link", "Leave it"])
			expect(block.button(name).disabled).toBe(true);
		expect(
			(block.getByLabelText("Message") as HTMLTextAreaElement).disabled,
		).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "Your card was declined." });
		expect(block.getByRole("alert").textContent).toBe(
			"Your card was declined.",
		);
	});
});
