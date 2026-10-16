import { stripeTestKit } from "../stripeTestKit";

const kit = await stripeTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../stripeFixtures");
const { StripeSubscriptionBlock } = await import("./StripeSubscriptionBlock");

type Props = Parameters<typeof StripeSubscriptionBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(StripeSubscriptionBlock, {
		view: fx.cancelView,
		actions: fx.subscriptionActions,
		...props,
	});
const checked = (block: ReturnType<typeof mount>, name: string) =>
	block.getByRole("radio", { name }).getAttribute("aria-checked") === "true";

describe("cancel", () => {
	test("opens on the agent's choice: now, with the prorated refund", async () => {
		const block = mount();
		expect(checked(block, "Immediately")).toBe(true);
		expect(checked(block, "Prorated amount $13.42 of $20.00")).toBe(true);
		expect(
			block.getAllByRole("radio").map((radio) => {
				const row = radio.nextElementSibling as HTMLElement;
				return [...row.children].map((child) => child.textContent);
			}),
		).toEqual([
			["Immediately", "Oct 1, 2037"],
			["End of the current period", "Nov 3, 2037"],
			["No refund"],
			["Last payment $20.00"],
			["Prorated amount $13.42 of $20.00"],
		]);
		await block.click("Cancel subscription");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			"Cancel Pro for Avery Chen now and refund $13.42 to Visa •••• 4242?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"cancel",
				{
					when: "now",
					refund: "prorated",
					prorationDate: fx.cancelView.preview.prorationDate,
					prorated: 1342,
				},
			],
		]);
	});

	test("now, with the last payment back", async () => {
		const block = mount();
		await block.choose("Last payment $20.00");
		await block.click("Cancel subscription");
		expect(block.question()).toBe(
			"Cancel Pro for Avery Chen now and refund $20.00 to Visa •••• 4242?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"cancel",
				{
					when: "now",
					refund: "last_payment",
					charge: fx.cancelView.preview.lastPayment?.charge,
					amount: 2000,
				},
			],
		]);
	});

	test("now, with no refund", async () => {
		const block = mount();
		await block.choose("No refund");
		await block.click("Cancel subscription");
		expect(block.question()).toBe("Cancel Pro for Avery Chen now? No refund.");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["cancel", { when: "now", refund: "none" }],
		]);
	});

	test("at the end of the period there is no refund to choose", async () => {
		const block = mount();
		await block.choose("End of the current period");
		expect(block.getAllByRole("radio").length).toBe(3);
		expect(checked(block, "No refund")).toBe(true);
		expect(
			block.getByText(
				"You can't issue a refund here when canceling at the end of the period. However, you can still issue a refund manually.",
			),
		).toBeTruthy();
		await block.click("Cancel subscription");
		expect(block.question()).toBe(
			"Cancel Pro for Avery Chen on Nov 3, 2037? No refund.",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["cancel", { when: "period_end", refund: "none" }],
		]);
	});

	test("a refund with nothing behind it is not offered", () => {
		const block = mount({
			view: {
				...fx.cancelView,
				preview: {
					...fx.cancelView.preview,
					prorated: { amount: 0, currency: "usd" },
					lastPayment: null,
				},
			},
		});
		expect(block.getAllByRole("radio").length).toBe(3);
		expect(checked(block, "No refund")).toBe(true);
	});

	test("the prorated amount alone when there is no last payment", () => {
		const block = mount({
			view: {
				...fx.cancelView,
				preview: { ...fx.cancelView.preview, lastPayment: null },
			},
		});
		expect(checked(block, "Prorated amount $13.42")).toBe(true);
	});

	test("the server's default is now, with no refund", async () => {
		const block = mount({
			view: {
				...fx.cancelView,
				proposed: { ...fx.cancelView.proposed, refund: "none" },
			},
		});
		expect(checked(block, "Immediately")).toBe(true);
		expect(checked(block, "No refund")).toBe(true);
	});

	test("the agent's choice of the period end", async () => {
		const block = mount({ view: fx.cancelAtPeriodEndView });
		expect(checked(block, "End of the current period")).toBe(true);
		await block.click("Cancel subscription");
		expect(block.question()).toBe(
			"Cancel Pro for Avery Chen on Nov 3, 2037? No refund.",
		);
		expect(
			[...document.body.querySelectorAll("[role='alertdialog'] button")].map(
				(button) => button.textContent,
			),
		).toEqual(["Don't cancel", "Cancel subscription"]);
	});

	test("don't cancel", async () => {
		const block = mount();
		await block.click("Don't cancel");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("pause", () => {
	test("opens on the agent's date and keeps invoices as drafts", async () => {
		const block = mount({ view: fx.pauseView });
		expect(checked(block, "Until a custom date")).toBe(true);
		expect(block.button("Resume date").textContent).toBe("Nov 3, 2037");
		expect(
			block
				.getAllByRole("radio")
				.map((radio) => radio.getAttribute("aria-label")),
		).toEqual([
			"Indefinite",
			"Until a custom date",
			"Keep invoices as drafts",
			"Mark invoices uncollectible",
			"Void invoices",
		]);
		expect(checked(block, "Keep invoices as drafts")).toBe(true);
		expect(
			block.getByText(
				"Invoices will be created as drafts. You can finalize and collect payment later.",
			),
		).toBeTruthy();
		await block.click("Pause");
		expect(block.question()).toBe(
			"Pause payment collection on Pro for Avery Chen until Nov 3, 2037?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"pause",
				{
					resumesAt: new Date(2037, 10, 3).toISOString(),
					behavior: "keep_as_draft",
				},
			],
		]);
	});

	test("Stripe's defaults: no end date, and the date opens on the period end", async () => {
		const block = mount({ view: fx.pauseDefaultsView });
		expect(checked(block, "Indefinite")).toBe(true);
		expect(checked(block, "Keep invoices as drafts")).toBe(true);
		expect(block.queryByRole("button", { name: "Resume date" })).toBeNull();
		await block.choose("Until a custom date");
		expect(block.button("Resume date").textContent).toBe("Nov 3, 2037");
		await block.choose("Indefinite");
		await block.click("Pause");
		expect(block.question()).toBe(
			"Pause payment collection on Pro for Avery Chen with no end date?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["pause", { resumesAt: null, behavior: "keep_as_draft" }],
		]);
	});

	test("the agent's invoice behavior", () => {
		const block = mount({
			view: {
				...fx.pauseView,
				proposed: { ...fx.pauseView.proposed, behavior: "mark_uncollectible" },
			},
		});
		expect(checked(block, "Mark invoices uncollectible")).toBe(true);
	});

	test("another day, at 00:00 local time", async () => {
		const block = mount({ view: fx.pauseView });
		await block.pickDay("Resume date", /November 17th/);
		await block.click("Pause");
		expect(block.question()).toBe(
			"Pause payment collection on Pro for Avery Chen until Nov 17, 2037?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			resumesAt: new Date(2037, 10, 17).toISOString(),
			behavior: "keep_as_draft",
		});
	});

	test("with no end, voiding invoices", async () => {
		const block = mount({ view: fx.pauseView });
		await block.choose("Indefinite");
		expect(block.queryByRole("button", { name: "Resume date" })).toBeNull();
		await block.choose("Void invoices");
		await block.click("Pause");
		expect(block.question()).toBe(
			"Pause payment collection on Pro for Avery Chen with no end date?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["pause", { resumesAt: null, behavior: "void" }],
		]);
	});

	test("the way out reads as the server names it", async () => {
		const block = mount({ view: fx.pauseView, actions: fx.pauseActions });
		await block.click("Keep subscription");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("a day that has passed cannot be chosen", () => {
		const block = mount({
			view: {
				...fx.pauseView,
				proposed: {
					...fx.pauseView.proposed,
					resumesAt: "2037-09-03T12:00:00.000Z",
				},
			},
		});
		expect(block.button("Pause").disabled).toBe(true);
	});
});

describe("switching", () => {
	test("from cancel to pause and back", async () => {
		const block = mount();
		expect(block.queryByRole("button", { name: "Pause" })).toBeNull();
		await block.click("Pause payment collection instead");
		expect(
			block.queryByRole("button", { name: "Cancel subscription" }),
		).toBeNull();
		expect(checked(block, "Indefinite")).toBe(true);
		await block.click("Cancel subscription instead");
		expect(block.button("Cancel subscription")).toBeTruthy();
	});

	test("only when the other action is offered", () => {
		const block = mount({
			actions: fx.subscriptionActions.filter((action) => action.id !== "pause"),
		});
		expect(
			block.queryByRole("button", { name: "Pause payment collection instead" }),
		).toBeNull();
	});

	test("the flow that is offered shows when the proposed one is not", () => {
		const block = mount({
			view: fx.pauseView,
			actions: fx.subscriptionActions.filter((action) => action.id !== "pause"),
		});
		expect(block.button("Cancel subscription")).toBeTruthy();
	});
});

describe("paused already", () => {
	test("says until when, and resumes after a confirmation", async () => {
		const block = mount({ view: fx.pausedView, actions: fx.pausedActions });
		expect(block.getAllByText("Paused until Dec 1, 2037").length).toBe(2);
		expect(
			block.queryByRole("button", { name: "Pause payment collection instead" }),
		).toBeNull();
		await block.click("Resume payment collection");
		expect(block.question()).toBe(
			"Resume payment collection on Pro for Avery Chen?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["resume"]]);
	});

	test("with no end", () => {
		const paused = { ...fx.pro, paused: { resumesAt: null } };
		const block = mount({
			view: {
				...fx.pausedView,
				customer: { ...fx.avery, subscriptions: [paused] },
				subscription: paused,
			},
			actions: fx.pausedActions,
		});
		expect(block.getAllByText("Paused indefinitely").length).toBe(2);
	});
});

describe("canceled already", () => {
	test("nothing is left to choose", async () => {
		const canceled = { ...fx.pro, status: "canceled" };
		const block = mount({
			view: {
				...fx.cancelView,
				customer: { ...fx.avery, subscriptions: [canceled] },
				subscription: canceled,
			},
			actions: [
				{ id: "dismiss", label: "Done", style: "secondary", role: "dismiss" },
			],
		});
		expect(block.queryAllByRole("radio").length).toBe(0);
		await block.click("Done");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("states", () => {
	test("settled: the facts stay and the controls go", () => {
		const block = mount({ view: fx.pausedView, done: true });
		expect(block.getByText("Avery Chen")).toBeTruthy();
		expect(block.getAllByText("Paused until Dec 1, 2037").length).toBe(2);
		expect(block.queryAllByRole("radio").length).toBe(0);
		expect(
			block.queryByRole("button", { name: /cancel|Pause|Resume|Keep/i }),
		).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Cancel subscription").disabled).toBe(true);
		expect(block.button("Don't cancel").disabled).toBe(true);
		for (const radio of block.getAllByRole("radio"))
			expect((radio as HTMLButtonElement).disabled).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "The prorated amount changed" });
		expect(block.getByRole("alert").textContent).toBe(
			"The prorated amount changed",
		);
	});

	test("an environment that may not write", () => {
		const block = mount({
			view: { ...fx.cancelView, account: fx.lockedAccount },
			actions: fx.locked(fx.subscriptionActions),
		});
		expect(block.getByRole("alert").textContent).toBe(fx.WRITES_OFF);
		expect(block.button("Cancel subscription").disabled).toBe(true);
	});
});
