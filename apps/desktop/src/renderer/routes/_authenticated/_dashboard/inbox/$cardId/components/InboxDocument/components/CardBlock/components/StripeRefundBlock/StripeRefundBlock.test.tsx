import { stripeTestKit } from "../stripeTestKit";

const kit = await stripeTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../stripeFixtures");
const { StripeRefundBlock } = await import("./StripeRefundBlock");

type Props = Parameters<typeof StripeRefundBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(StripeRefundBlock, {
		view: fx.refundView,
		actions: fx.refundActions,
		...props,
	});
const email = fx.refundView.email as NonNullable<typeof fx.refundView.email>;

describe("refund", () => {
	test("opens on the agent's amount, reason and reply, and asks before it writes", async () => {
		const block = mount();
		expect(
			(block.getByLabelText("Refund amount") as HTMLInputElement).value,
		).toBe("25.00");
		expect(block.getByText("of $49.00 refundable")).toBeTruthy();
		expect((block.getByLabelText("Reason") as HTMLSelectElement).value).toBe(
			"requested_by_customer",
		);
		expect((block.getByLabelText("Reply") as HTMLTextAreaElement).value).toBe(
			email.draft,
		);
		expect(block.getByText("To avery@example.com")).toBeTruthy();
		expect(
			block.getByRole("link", { name: "Open in Gmail" }).getAttribute("href"),
		).toBe(email.url);

		await block.click("Refund");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			"Refund $25.00 of the $49.00 charge to Avery Chen's Visa •••• 4242? A reply is sent to avery@example.com.",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"refund",
				{
					amount: 2500,
					reason: "requested_by_customer",
					cancel: null,
					reply: { text: email.draft, version: email.version },
				},
			],
		]);
	});

	test("with the subscription cancelled, no reason and no reply", async () => {
		const block = mount();
		await block.click("Refund full amount");
		await block.type("Reason", "");
		await block.type("Reply", "  ");
		await kit.act(async () => {
			kit.fireEvent.click(
				block.getByRole("checkbox", { name: "Also cancel Pro" }),
			);
		});
		await block.click("Refund");
		expect(block.question()).toBe(
			"Refund $49.00 of the $49.00 charge to Avery Chen's Visa •••• 4242? The Pro subscription is canceled now.",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"refund",
				{ amount: 4900, reason: null, cancel: fx.pro.id, reply: null },
			],
		]);
	});

	test("cancel and reply together", async () => {
		const block = mount({
			view: {
				...fx.refundView,
				proposed: { ...fx.refundView.proposed, cancel: fx.pro.id },
			},
		});
		await block.click("Refund");
		expect(block.question()).toBe(
			"Refund $25.00 of the $49.00 charge to Avery Chen's Visa •••• 4242? The Pro subscription is canceled now. A reply is sent to avery@example.com.",
		);
	});

	test("only one subscription is cancelled", async () => {
		const block = mount({
			view: { ...fx.refundNoEmailView, customer: fx.averyTwoPlans },
		});
		const box = (name: string) => block.getByRole("checkbox", { name });
		await kit.act(async () => {
			kit.fireEvent.click(box("Also cancel Pro"));
		});
		await kit.act(async () => {
			kit.fireEvent.click(box("Also cancel Team add-on"));
		});
		expect(box("Also cancel Pro").getAttribute("aria-checked")).toBe("false");
		await block.click("Refund");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({
			cancel: fx.teamAddOn.id,
		});
	});

	test("rejects zero, more than is refundable, and too many decimals", async () => {
		const block = mount({ view: fx.partRefundView });
		expect(block.getByText("of $39.00 refundable")).toBeTruthy();
		expect(block.getByText("Already refunded")).toBeTruthy();
		expect(block.button("Refund").disabled).toBe(false);
		const field = () => block.getByLabelText("Refund amount");
		const sentence = () =>
			block.container.querySelector("p.text-destructive")?.textContent ?? null;
		for (const [text, error] of [
			["0", "Amount cannot be $0.00."],
			["0.00", "Amount cannot be $0.00."],
			["", "Amount cannot be $0.00."],
			["39.01", "Amount cannot be more than $39.00."],
			["25.001", null],
			["abc", null],
		] as const) {
			await block.type("Refund amount", text);
			expect(block.button("Refund").disabled).toBe(true);
			expect(field().getAttribute("aria-invalid")).toBe("true");
			expect(sentence()).toBe(error);
		}
		await block.type("Refund amount", "39");
		expect(block.button("Refund").disabled).toBe(false);
		expect(field().getAttribute("aria-invalid")).toBeNull();
		expect(sentence()).toBeNull();
	});

	test("the reasons are Stripe's, in Stripe's order", () => {
		const options = [
			...(mount().getByLabelText("Reason") as HTMLSelectElement).options,
		].map((option) => [option.value, option.textContent]);
		expect(options).toEqual([
			["", "Select a reason"],
			["duplicate", "Duplicate"],
			["fraudulent", "Fraudulent"],
			["requested_by_customer", "Requested by customer"],
			["other", "Other"],
		]);
	});

	test("fraudulent: the button reads Refund and block and says what is blocked", async () => {
		const block = mount({ view: fx.refundNoEmailView });
		const FRAUD =
			"Marking this payment as fraudulent adds the associated payment method and email to your block lists. Stripe uses this data to block similar payments and improve our fraud detection.";
		expect(block.queryByText(FRAUD)).toBeNull();
		await block.type("Reason", "fraudulent");
		expect(block.getByText(FRAUD)).toBeTruthy();
		expect(block.queryByRole("button", { name: "Refund" })).toBeNull();
		await block.click("Refund and block");
		expect(block.question()).toBe(
			"Refund $25.00 of the $49.00 charge to Avery Chen's Visa •••• 4242? The payment method and email are added to your block lists.",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"refund",
				{ amount: 2500, reason: "fraudulent", cancel: null, reply: null },
			],
		]);
	});

	test("the reason Other", async () => {
		const block = mount({
			view: {
				...fx.refundNoEmailView,
				proposed: { ...fx.refundNoEmailView.proposed, reason: "other" },
			},
		});
		expect((block.getByLabelText("Reason") as HTMLSelectElement).value).toBe(
			"other",
		);
		await block.click("Refund");
		expect(block.question()).toBe(
			"Refund $25.00 of the $49.00 charge to Avery Chen's Visa •••• 4242?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["refund", { amount: 2500, reason: "other", cancel: null, reply: null }],
		]);
	});

	test("a zero-decimal currency takes whole amounts", async () => {
		const block = mount({ view: fx.yenRefundView });
		expect(
			(block.getByLabelText("Refund amount") as HTMLInputElement).value,
		).toBe("4900");
		await block.type("Refund amount", "49.5");
		expect(block.button("Refund").disabled).toBe(true);
		await block.type("Refund amount", "1200");
		await block.click("Refund");
		expect(block.question()).toBe(
			"Refund ¥1,200 of the ¥4,900 charge to Kenji Sato's Jcb •••• 0505?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["refund", { amount: 1200, reason: null, cancel: null, reply: null }],
		]);
	});

	test("a guest charge", async () => {
		const block = mount({ view: fx.guestRefundView });
		expect(block.getByText("Guest customer")).toBeTruthy();
		expect(block.queryByRole("checkbox")).toBeNull();
		await block.click("Refund");
		expect(block.question()).toBe(
			"Refund $49.00 of the $49.00 charge to this customer's Visa •••• 4242?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"refund",
				{ amount: 4900, reason: "duplicate", cancel: null, reply: null },
			],
		]);
	});

	test("no reply goes out when Gmail cannot send one", async () => {
		const block = mount({
			view: { ...fx.refundView, email: { ...email, canReply: false } },
		});
		expect(
			(block.getByLabelText("Reply") as HTMLTextAreaElement).disabled,
		).toBe(true);
		await block.click("Refund");
		expect(block.question()).toBe(
			"Refund $25.00 of the $49.00 charge to Avery Chen's Visa •••• 4242?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({ reply: null });
	});

	test("an email from another address than the customer's is marked", () => {
		expect(
			mount().queryByText("Not the customer's address in Stripe"),
		).toBeNull();
		const block = mount({
			view: { ...fx.refundView, email: { ...email, fromCustomer: false } },
		});
		expect(block.getByText("Not from avery@example.com")).toBeTruthy();
	});

	test("do not refund", async () => {
		const block = mount();
		await block.click("Do not refund");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("nothing left to refund", () => {
	test("no amount to type, and the button is off for the server's reason", () => {
		const block = mount({
			view: {
				...fx.refundNoEmailView,
				charge: { ...fx.packageCharge, refunded: 4900 },
				refundable: 0,
				proposed: { amount: 0, reason: null, cancel: null },
			},
			actions: fx.refundActions.map((action) =>
				action.id === "refund"
					? { ...action, disabled: "This charge has nothing left to refund" }
					: action,
			),
		});
		expect(block.queryByLabelText("Refund amount")).toBeNull();
		expect(block.button("Refund").disabled).toBe(true);
		expect(block.button("Do not refund").disabled).toBe(false);
	});
});

describe("states", () => {
	test("settled: the facts stay and the controls go", () => {
		const block = mount({ done: true });
		expect(block.getByText("Avery Chen")).toBeTruthy();
		expect(block.getByText("Onboarding package")).toBeTruthy();
		expect(block.getByText(email.snippet)).toBeTruthy();
		expect(block.queryByRole("button", { name: "Refund" })).toBeNull();
		expect(block.queryByLabelText("Refund amount")).toBeNull();
		expect(block.queryByLabelText("Reply")).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Refund").disabled).toBe(true);
		expect(block.button("Do not refund").disabled).toBe(true);
		expect(
			(block.getByLabelText("Refund amount") as HTMLInputElement).disabled,
		).toBe(true);
		expect(
			(block.getByLabelText("Reply") as HTMLTextAreaElement).disabled,
		).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "Only $10.00 is left to refund" });
		expect(block.getByRole("alert").textContent).toBe(
			"Only $10.00 is left to refund",
		);
	});

	test("an environment that may not write", () => {
		const block = mount({
			view: { ...fx.refundView, account: fx.lockedAccount },
			actions: fx.locked(fx.refundActions),
		});
		expect(block.getByRole("alert").textContent).toBe(fx.WRITES_OFF);
		expect(block.button("Refund").disabled).toBe(true);
		expect(block.button("Do not refund").disabled).toBe(false);
	});
});
