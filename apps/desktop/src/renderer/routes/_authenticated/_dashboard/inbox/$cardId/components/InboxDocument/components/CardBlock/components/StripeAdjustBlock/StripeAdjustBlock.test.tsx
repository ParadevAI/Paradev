import { stripeTestKit } from "../stripeTestKit";

const kit = await stripeTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../stripeFixtures");
const { StripeAdjustBlock } = await import("./StripeAdjustBlock");

type Props = Parameters<typeof StripeAdjustBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(StripeAdjustBlock, {
		view: fx.couponView,
		actions: fx.couponActions,
		...props,
	});

describe("coupon", () => {
	test("lists the coupons with their terms and opens on the agent's", async () => {
		const block = mount();
		const rows = block
			.getAllByRole("radio")
			.map((radio) => radio.parentElement?.textContent);
		expect(rows).toEqual([
			"Win-back – 25% off for 3 months",
			"Sorry for the trouble – $5.00 off once",
			"Partner – 10% off forever",
		]);
		expect(block.queryByLabelText("Subscription")).toBeNull();
		await block.click("Apply coupon");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			"Apply 25% off for 3 months to Avery Chen's Pro subscription?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["coupon", { coupon: "WINBACK25", subscription: fx.pro.id }],
		]);
	});

	test("another coupon, on another subscription", async () => {
		const block = mount({ view: fx.couponTwoPlansView });
		await block.choose("Sorry for the trouble – $5.00 off once");
		await block.type("Subscription", fx.teamAddOn.id);
		await block.click("Apply coupon");
		expect(block.question()).toBe(
			"Apply $5.00 off once to Avery Chen's Team add-on subscription?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["coupon", { coupon: "FIVEOFF", subscription: fx.teamAddOn.id }],
		]);
	});

	test("a coupon with no end, and one for a single month", async () => {
		const block = mount();
		await block.choose("Partner – 10% off forever");
		await block.click("Apply coupon");
		expect(block.question()).toBe(
			"Apply 10% off forever to Avery Chen's Pro subscription?",
		);
		const oneMonth = mount({
			view: {
				...fx.couponView,
				coupons: [{ ...fx.coupons[0], months: 1 } as (typeof fx.coupons)[0]],
			},
		});
		expect(oneMonth.getByText("Win-back – 25% off for 1 month")).toBeTruthy();
	});

	test("keep as is", async () => {
		const block = mount();
		await block.click("Keep as is");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("credit", () => {
	const credit = (props: Partial<Props> = {}) =>
		mount({ view: fx.creditView, actions: fx.creditActions, ...props });

	const fact = (block: ReturnType<typeof mount>, label: string) =>
		block.getByText(label).nextElementSibling?.textContent;
	const APPLY = "Apply to credit balance";

	test("opens on the agent's amount, type and note, with the balance it makes", async () => {
		const block = credit();
		expect(fact(block, "Starting balance")).toBe("$0.00");
		expect(fact(block, "New balance")).toBe("($10.00)");
		expect(
			(block.getByLabelText("Adjustment type") as HTMLSelectElement).value,
		).toBe("credit");
		expect((block.getByLabelText("Amount") as HTMLInputElement).value).toBe(
			"10.00",
		);
		await block.click(APPLY);
		expect(block.question()).toBe("Add $10.00 credit to Avery Chen's balance?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"credit",
				{
					amount: 1000,
					direction: "credit",
					note: "Goodwill for the outage on Oct 1",
				},
			],
		]);
	});

	test("another amount with the note emptied", async () => {
		const block = credit();
		await block.type("Amount", "7.5");
		expect(fact(block, "New balance")).toBe("($7.50)");
		await block.type("Add internal note", " ");
		await block.click(APPLY);
		expect(block.question()).toBe("Add $7.50 credit to Avery Chen's balance?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["credit", { amount: 750, direction: "credit" }],
		]);
	});

	test("a debit comes off the credit the customer holds", async () => {
		const block = credit({ view: fx.debitView });
		expect(fact(block, "Starting balance")).toBe("($10.00)");
		expect(fact(block, "New balance")).toBe("$0.00");
		expect(
			(block.getByLabelText("Adjustment type") as HTMLSelectElement).value,
		).toBe("debit");
		await block.type("Amount", "25");
		expect(fact(block, "New balance")).toBe("$15.00");
		await block.click(APPLY);
		expect(block.question()).toBe(
			"Debit $25.00 from Avery Chen's credit balance?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"credit",
				{
					amount: 2500,
					direction: "debit",
					note: "Credit added twice on Oct 1",
				},
			],
		]);
	});

	test("the type changes what the amount does", async () => {
		const block = credit({ view: fx.debitView });
		await block.type("Adjustment type", "credit");
		expect(fact(block, "New balance")).toBe("($20.00)");
		await block.click(APPLY);
		expect(block.question()).toBe("Add $10.00 credit to Avery Chen's balance?");
	});

	test("no amount: no new balance, and nothing to apply", () => {
		const block = credit({
			view: {
				...fx.creditView,
				proposed: { ...fx.creditView.proposed, credit: null },
			},
		});
		expect(fact(block, "New balance")).toBe("—");
		expect(block.button(APPLY).disabled).toBe(true);
	});

	test("rejects zero, too many decimals, and more than Stripe takes", async () => {
		const block = credit();
		const sentence = () =>
			block.container.querySelector("p.text-destructive")?.textContent ?? null;
		for (const [text, error] of [
			["0", "Amount cannot be $0.00."],
			["", "Amount cannot be $0.00."],
			["100000.01", "Amount cannot be more than $100,000.00."],
			["1.234", null],
			["ten", null],
		] as const) {
			await block.type("Amount", text);
			expect(block.button(APPLY).disabled).toBe(true);
			expect(fact(block, "New balance")).toBe("—");
			expect(sentence()).toBe(error);
		}
		await block.type("Amount", "100000");
		expect(block.button(APPLY).disabled).toBe(false);
		expect(sentence()).toBeNull();
	});

	test("the note holds 350 characters", () => {
		expect(
			(credit().getByLabelText("Add internal note") as HTMLTextAreaElement)
				.maxLength,
		).toBe(350);
	});
});

describe("trial", () => {
	const trial = (props: Partial<Props> = {}) =>
		mount({ view: fx.trialView, actions: fx.trialActions, ...props });

	test("shows the current end and opens on the agent's new one", async () => {
		const block = trial();
		expect(
			block.getByText("Current trial end").nextElementSibling?.textContent,
		).toBe("Oct 17, 2037");
		expect(
			(block.getByLabelText("Free trial days") as HTMLInputElement).value,
		).toBe("23");
		expect(block.getByText("Ends Oct 24, 2037")).toBeTruthy();
		await block.click("Extend trial");
		expect(block.question()).toBe(
			"Extend Blake Rivera's trial of Pro to Oct 24, 2037?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"trial",
				{
					trialEnd: fx.trialView.proposed.trialEnd,
					subscription: fx.blake.subscriptions[0]?.id,
				},
			],
		]);
	});

	test("another number of days ends at 00:00 local time", async () => {
		const block = trial();
		await block.type("Free trial days", "26");
		expect(block.getByText("Ends Oct 27, 2037")).toBeTruthy();
		await block.click("Extend trial");
		expect(block.question()).toBe(
			"Extend Blake Rivera's trial of Pro to Oct 27, 2037?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({
			trialEnd: new Date(2037, 9, 27).toISOString(),
		});
	});

	test("the new end must be in the future", () => {
		const block = trial({
			view: {
				...fx.trialView,
				proposed: {
					...fx.trialView.proposed,
					trialEnd: "2037-09-24T12:00:00.000Z",
				},
			},
		});
		expect(block.button("Extend trial").disabled).toBe(true);
		expect(
			block.getByLabelText("Free trial days").getAttribute("aria-invalid"),
		).toBe("true");
	});

	test("at least one whole day", async () => {
		const block = trial();
		for (const text of ["0", "", "1.5", "-3"]) {
			await block.type("Free trial days", text);
			expect(block.button("Extend trial").disabled).toBe(true);
		}
		await block.type("Free trial days", "1");
		expect(block.getByText("Ends Oct 2, 2037")).toBeTruthy();
		expect(block.button("Extend trial").disabled).toBe(false);
	});
});

describe("states", () => {
	test("settled: the facts stay and the controls go", () => {
		const block = mount({ done: true });
		expect(block.getByText("Avery Chen")).toBeTruthy();
		expect(block.queryAllByRole("radio").length).toBe(0);
		expect(block.queryByRole("button", { name: /Apply|Keep/ })).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Apply coupon").disabled).toBe(true);
		expect(block.button("Keep as is").disabled).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({
			failure: "That coupon is not one this account can still use",
		});
		expect(block.getByRole("alert").textContent).toBe(
			"That coupon is not one this account can still use",
		);
	});

	test("the reason an action is off", () => {
		const block = mount({
			view: { ...fx.couponView, account: fx.lockedAccount },
			actions: fx.locked(fx.couponActions),
		});
		expect(block.getByRole("alert").textContent).toBe(fx.WRITES_OFF);
		expect(block.button("Apply coupon").disabled).toBe(true);
	});
});
