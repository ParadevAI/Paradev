import { stripeTestKit } from "../stripeTestKit";

const kit = await stripeTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../stripeFixtures");
const { StripeDisputeBlock } = await import("./StripeDisputeBlock");
const { DisputeDeadline } = await import("./components/DisputeDeadline");

type Props = Parameters<typeof StripeDisputeBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(StripeDisputeBlock, {
		view: fx.disputeView,
		actions: fx.disputeActions,
		...props,
	});
const fact = (block: ReturnType<typeof mount>, label: string) =>
	block.getByText(label).nextElementSibling?.textContent;
const LABELS = [
	"Product description",
	"Customer name",
	"Customer email",
	"Billing address",
	"Service date",
	"Access activity log",
	"Additional information",
];

describe("dispute", () => {
	test("what the bank asks and by when", () => {
		const block = mount();
		expect(block.getByText("The customer disputed this payment")).toBeTruthy();
		expect(fact(block, "Disputed amount")).toBe("$49.00Needs response");
		expect(fact(block, "Reason")).toBe("Product not received");
		expect(fact(block, "Deadline")).toBe("Respond by Oct 20, 203719 days left");
		expect(fact(block, "Charge")).toBe("$49.00Succeeded");
		expect(fact(block, "Description")).toBe("Onboarding package");
	});

	test.each([
		["fraudulent", "Fraudulent"],
		["subscription_canceled", "Subscription canceled"],
		["some_new_reason", "Some new reason"],
	])("the reason %s reads %s", (reason, label) => {
		const block = mount({
			view: {
				...fx.disputeView,
				dispute: { ...fx.disputeView.dispute, reason },
			},
		});
		expect(fact(block, "Reason")).toBe(label);
	});

	test("seven evidence fields in Stripe's order, with the agent's drafts marked", () => {
		const block = mount();
		expect(
			block
				.getAllByRole("textbox")
				.map((box) => box.getAttribute("aria-label")),
		).toEqual(LABELS);
		const drafted = block
			.getAllByText("Drafted")
			.map((tag) => tag.parentElement?.textContent);
		expect(drafted).toEqual([
			"Product descriptionDrafted",
			"Service dateDrafted",
			"Access activity logDrafted",
		]);
		expect(
			(block.getByLabelText("Customer name") as HTMLInputElement).value,
		).toBe("Avery Chen");
	});

	test("save sends the form and asks nothing", async () => {
		const block = mount();
		await block.type(
			"Additional information",
			"The customer joined two sessions.",
		);
		await block.click("Save draft");
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([
			[
				"save",
				{
					evidence: {
						...fx.disputeView.evidence,
						uncategorized_text: "The customer joined two sessions.",
					},
				},
			],
		]);
	});

	test("submit asks with the server's sentence", async () => {
		const block = mount();
		await block.type("Service date", "2037-10-06");
		await block.click("Submit evidence");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(fx.SUBMIT_CONFIRM);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"submit",
				{
					evidence: { ...fx.disputeView.evidence, service_date: "2037-10-06" },
				},
			],
		]);
	});

	test("accept asks with the server's sentence", async () => {
		const block = mount();
		await block.click("Accept dispute");
		expect(block.question()).toBe(fx.ACCEPT_CONFIRM);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["accept"]]);
	});
});

describe("inquiry", () => {
	const inquiry = (props: Partial<Props> = {}) =>
		mount({ view: fx.inquiryView, actions: fx.inquiryActions, ...props });

	test("says no money has moved, and there is nothing to accept", () => {
		const block = inquiry();
		expect(
			block.getByText("There was an inquiry on this payment"),
		).toBeTruthy();
		expect(
			block.getByText(
				"No funds have been withdrawn from your account yet, but the cardholder's bank is requesting more information to decide whether to return these funds to the cardholder.",
			),
		).toBeTruthy();
		expect(block.queryByText("The customer disputed this payment")).toBeNull();
		expect(fact(block, "Disputed amount")).toBe("$49.00Inquiry");
		expect(block.queryByRole("button", { name: "Accept dispute" })).toBeNull();
		expect(block.queryByRole("button", { name: "Submit evidence" })).toBeNull();
		expect(
			block
				.getAllByRole("button")
				.map((button) => button.textContent)
				.slice(-3),
		).toEqual(["Refund customer", "Save draft", "Respond to inquiry"]);
	});

	test("respond asks with the server's sentence and sends the form", async () => {
		const block = inquiry();
		await block.type("Billing address", "12 Elm Street, Springfield");
		await block.click("Respond to inquiry");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(fx.RESPOND_CONFIRM);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"submit",
				{
					evidence: {
						...fx.inquiryView.evidence,
						billing_address: "12 Elm Street, Springfield",
					},
				},
			],
		]);
	});

	test("refund customer asks with the server's sentence and sends no input", async () => {
		const block = inquiry();
		await block.click("Refund customer");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(fx.INQUIRY_REFUND_CONFIRM);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["refund"]]);
	});

	test("a dispute has no refund", () => {
		expect(
			mount().queryByRole("button", { name: "Refund customer" }),
		).toBeNull();
	});
});

describe("read-only", () => {
	test("evidence that was submitted is text", () => {
		const block = mount({
			view: fx.submittedDisputeView,
			actions: fx.closedDisputeActions,
		});
		expect(fact(block, "Disputed amount")).toBe("$49.00Under review");
		expect(block.queryAllByRole("textbox").length).toBe(0);
		expect(block.queryByText("Drafted")).toBeNull();
		expect(
			block.getByText(fx.disputeView.evidence.product_description),
		).toBeTruthy();
		expect(block.queryByRole("button", { name: "Submit evidence" })).toBeNull();
		expect(block.queryByRole("button", { name: "Save draft" })).toBeNull();
		expect(block.button("Accept dispute").disabled).toBe(true);
	});

	test("one submission is enough to close the form", () => {
		const block = mount({
			view: {
				...fx.disputeView,
				dispute: { ...fx.disputeView.dispute, submissions: 1 },
			},
		});
		expect(block.queryAllByRole("textbox").length).toBe(0);
	});

	test("past the deadline the form is off for the server's reason", () => {
		const block = mount({
			view: fx.pastDueDisputeView,
			actions: fx.pastDueDisputeActions,
		});
		expect(fact(block, "Deadline")).toBe(
			"Respond by Sep 20, 2037Deadline passed",
		);
		for (const box of block.getAllByRole("textbox"))
			expect((box as HTMLInputElement).disabled).toBe(true);
		expect(block.button("Submit evidence").disabled).toBe(true);
		expect(block.button("Save draft").disabled).toBe(true);
	});
});

describe("deadline", () => {
	const deadline = (dueBy: string, pastDue = false) => {
		const view = kit.render(
			<DisputeDeadline dueBy={dueBy} pastDue={pastDue} />,
		);
		const left = view.container.querySelector("span > span") as HTMLElement;
		return {
			text: left.textContent,
			urgent: left.className.includes("text-destructive"),
		};
	};

	test("days left, red under three", () => {
		expect(deadline("2037-10-20T12:00:00.000Z")).toEqual({
			text: "19 days left",
			urgent: false,
		});
		expect(deadline("2037-10-04T19:00:00.000Z")).toEqual({
			text: "3 days left",
			urgent: false,
		});
		expect(deadline("2037-10-03T12:00:00.000Z")).toEqual({
			text: "2 days left",
			urgent: true,
		});
		expect(deadline("2037-10-02T12:00:00.000Z")).toEqual({
			text: "1 day left",
			urgent: true,
		});
	});

	test("passed", () => {
		expect(deadline("2037-10-01T12:00:00.000Z")).toEqual({
			text: "Deadline passed",
			urgent: true,
		});
		expect(deadline("2037-10-20T12:00:00.000Z", true)).toEqual({
			text: "Deadline passed",
			urgent: true,
		});
	});
});

describe("states", () => {
	test("settled: the facts stay and the controls go", () => {
		const block = mount({ done: true });
		expect(fact(block, "Reason")).toBe("Product not received");
		expect(block.getByText("Avery Chen", { selector: "p" })).toBeTruthy();
		expect(block.queryAllByRole("textbox").length).toBe(0);
		expect(
			block.queryByRole("button", { name: /Submit|Save|Accept/ }),
		).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		for (const name of ["Submit evidence", "Save draft", "Accept dispute"])
			expect(block.button(name).disabled).toBe(true);
		for (const box of block.getAllByRole("textbox"))
			expect((box as HTMLInputElement).disabled).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "Stripe did not take the evidence" });
		expect(block.getByRole("alert").textContent).toBe(
			"Stripe did not take the evidence",
		);
	});
});
