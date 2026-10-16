import { stripeTestKit } from "../stripeTestKit";

const { act, fireEvent, render } = await stripeTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../stripeFixtures");
const { StripeCustomerHeader } = await import("./StripeCustomerHeader");

type Props = Parameters<typeof StripeCustomerHeader>[0];
const mount = (props: Partial<Props> = {}) =>
	render(
		<StripeCustomerHeader
			customer={fx.avery}
			account={fx.account}
			{...props}
		/>,
	);

describe("StripeCustomerHeader", () => {
	test("who the customer is and what they paid", () => {
		const header = mount();
		expect(header.getByText("Avery Chen")).toBeTruthy();
		expect(header.getByText("avery@example.com")).toBeTruthy();
		expect(
			header.getByRole("link", { name: "Open in Stripe" }).getAttribute("href"),
		).toBe(fx.avery.url);
		expect(header.getByText("Card").nextElementSibling?.textContent).toBe(
			"Visa •••• 4242",
		);
		expect(header.getByText("Paid").nextElementSibling?.textContent).toBe(
			"$69.00",
		);
		expect(header.queryByText("Credit balance")).toBeNull();
		expect(header.queryByText("Delinquent")).toBeNull();
		expect(header.queryByRole("alert")).toBeNull();
	});

	test("a subscription with its price, status and next date", () => {
		const header = mount();
		const row = header.getByRole("link", { name: "Pro" }).closest("li");
		expect(row?.textContent).toBe(
			"Pro$20.00 per monthActiveRenews Nov 3, 2037",
		);
	});

	test("trial, pause, quantity and cancellation wording", () => {
		const text = (subscription: (typeof fx.avery.subscriptions)[number]) =>
			mount({
				customer: { ...fx.avery, subscriptions: [subscription] },
			}).container.querySelector("li")?.textContent;
		expect(text(fx.blake.subscriptions[0] as never)).toBe(
			"Pro$20.00 per monthTrialingTrial ends Oct 17, 2037",
		);
		expect(text(fx.pausedPro)).toBe(
			"Pro$20.00 per monthActivePaused until Dec 1, 2037Renews Nov 3, 2037",
		);
		expect(text({ ...fx.pro, paused: { resumesAt: null } })).toContain(
			"Paused indefinitely",
		);
		expect(text(fx.teamAddOn)).toBe(
			"Team add-on$500.00 per year × 2ActiveRenews Nov 3, 2037",
		);
		expect(text({ ...fx.pro, items: 3, metered: true })).toBe(
			"Pro +2 more$20.00 per month + usageActiveRenews Nov 3, 2037",
		);
		expect(
			text({
				...fx.pro,
				metered: true,
				price: { ...fx.pro.price, amount: 0 },
			}),
		).toBe("ProUsage-basedActiveRenews Nov 3, 2037");
		expect(text({ ...fx.pro, cancelAtPeriodEnd: true })).toContain(
			"Cancels Nov 3, 2037",
		);
		expect(
			text({
				...fx.pro,
				price: { ...fx.pro.price, intervalCount: 3 },
			}),
		).toContain("$20.00 every 3 months");
	});

	test("three charges, then all of them", async () => {
		const header = mount();
		const rows = () =>
			[...header.container.querySelectorAll("ul")].at(-1)?.children ?? [];
		expect(rows().length).toBe(3);
		expect(rows()[0]?.textContent).toBe(
			"Oct 3, 2037$49.00SucceededVisa •••• 4242",
		);
		expect(rows()[2]?.textContent).toBe(
			"Sep 3, 2037$20.00SucceededVisa •••• 4242Refunded",
		);
		await act(async () => {
			fireEvent.click(header.getByRole("button", { name: "Show all" }));
		});
		expect(rows().length).toBe(5);
		expect(rows()[3]?.textContent).toBe(
			"Aug 20, 2037$20.00FailedMastercard •••• 4444",
		);
		expect(rows()[4]?.textContent).toContain("Disputed");
		expect(header.getByRole("button", { name: "Show fewer" })).toBeTruthy();
	});

	test("a part refund names the amount", () => {
		const header = mount({
			customer: { ...fx.avery, charges: [fx.partlyRefundedCharge] },
		});
		expect(header.getByText("Refunded $10.00")).toBeTruthy();
		expect(header.queryByRole("button", { name: "Show all" })).toBeNull();
	});

	test("a credit balance", () => {
		const header = mount({ customer: fx.averyTwoPlans });
		expect(
			header.getByText("Credit balance").nextElementSibling?.textContent,
		).toBe("$10.00");
	});

	test("delinquent, with more charges than the card read", () => {
		const header = mount({ customer: fx.devon });
		expect(header.getByText("Delinquent")).toBeTruthy();
		expect(header.getByText("Paid").nextElementSibling?.textContent).toBe(
			"$80.00+",
		);
	});

	test("a customer with no card", () => {
		expect(
			mount({ customer: fx.blake }).getByText("No card on file"),
		).toBeTruthy();
	});

	test("a zero-decimal currency", () => {
		const header = mount({ customer: fx.kenji });
		expect(header.getByText("¥9,800")).toBeTruthy();
		expect(header.getByText("¥4,900 per month")).toBeTruthy();
		expect(header.getByText("Card").nextElementSibling?.textContent).toBe(
			"Jcb •••• 0505",
		);
	});

	test("a guest charge has no customer", () => {
		const header = mount({ customer: null });
		expect(header.getByText("Guest customer")).toBeTruthy();
		expect(header.queryByRole("link")).toBeNull();
	});

	test("says once why nothing can be written", () => {
		const header = mount({ account: fx.lockedAccount });
		expect(header.getByRole("alert").textContent).toBe(fx.WRITES_OFF);
	});
});
