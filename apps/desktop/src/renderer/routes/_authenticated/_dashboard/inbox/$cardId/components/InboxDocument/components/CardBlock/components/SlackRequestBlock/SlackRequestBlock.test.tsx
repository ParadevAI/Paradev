import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../slackApprovalFixtures");
const { SlackRequestBlock } = await import("./SlackRequestBlock");

type Props = Parameters<typeof SlackRequestBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(SlackRequestBlock, {
		view: fx.requestView,
		actions: fx.requestActions,
		...props,
	});
const GRANT = { user: fx.casey.id, channel: fx.leadership.id };
const shownReply = (block: ReturnType<typeof mount>) =>
	[...block.container.querySelectorAll("[data-reply]")]
		.filter((each) => !each.classList.contains("hidden"))
		.map((each) => each.getAttribute("data-reply"));

describe("approve", () => {
	test("the request as Slack shows it, what approving does, and the reply", async () => {
		const block = mount();
		expect(block.getByText("#test-agents")).toBeTruthy();
		expect(block.container.textContent).toContain("for the launch review?");
		expect(
			block.getByRole("link", { name: "Open in Slack" }).getAttribute("href"),
		).toBe(fx.requestView.permalink);
		const grant = block.container.querySelector("[data-grant]");
		expect(grant?.textContent).toContain("Casey Nguyen");
		expect(grant?.textContent).toContain("leadership");
		expect(grant?.querySelector("[data-channel-kind=private]")).toBeTruthy();
		expect(shownReply(block)).toEqual(["approve"]);

		await block.click("Approve");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			"Add Casey Nguyen to #leadership and reply in the thread?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"approve",
				{
					reply: {
						text: "Approved, you are in.",
						blocks: [
							{
								type: "rich_text",
								elements: [
									{
										type: "rich_text_section",
										elements: [{ type: "text", text: "Approved, you are in." }],
									},
								],
							},
						],
					},
					grant: GRANT,
				},
			],
		]);
	});

	test("with no reply, only the person is added", async () => {
		const block = mount();
		await kit.write(kit.editors()[0], "");
		await block.click("Approve");
		expect(block.question()).toBe("Add Casey Nguyen to #leadership?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["approve", { reply: null, grant: GRANT }],
		]);
	});

	test("someone already in the channel: approving only replies", async () => {
		const block = mount({ view: fx.requestMemberView });
		expect(block.getByText("Already in this channel")).toBeTruthy();
		await block.click("Approve");
		expect(block.question()).toBe(
			'Reply "Approved, you are in." in the thread?',
		);
	});

	test("a guest and a shared channel are marked", () => {
		const block = mount({ view: fx.requestGuestView });
		const grant = block.container.querySelector("[data-grant]");
		expect(grant?.textContent).toContain("Guest");
		expect(grant?.textContent).toContain("External");
	});

	test("a request that grants nothing: the reply is the answer", async () => {
		const block = mount({ view: fx.requestReplyOnlyView });
		expect(block.container.querySelector("[data-grant]")).toBeNull();
		await block.click("Approve");
		expect(block.question()).toBe('Reply "Approved." in the thread?');
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({
			reply: { text: "Approved." },
			grant: null,
		});
	});

	test("nothing to add and nothing to say: approve is off", async () => {
		const block = mount({ view: fx.requestReplyOnlyView });
		await kit.write(kit.editors()[0], "");
		expect(block.button("Approve").disabled).toBe(true);
	});
});

describe("deny", () => {
	test("switches to the other reply, and sends it", async () => {
		const block = mount();
		await block.choose("Deny");
		expect(shownReply(block)).toEqual(["deny"]);
		expect(block.queryByRole("button", { name: "Approve" })).toBeNull();
		await block.click("Deny");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			'Reply "Not this time: ask in <#C0GENERAL01> for the summary." in the thread?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[0]).toBe("deny");
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({
			reply: { text: "Not this time: ask in <#C0GENERAL01> for the summary." },
		});
	});

	test("a reply is required", async () => {
		const block = mount();
		await block.choose("Deny");
		await kit.write(kit.editors()[1], "");
		expect(block.button("Deny").disabled).toBe(true);
		await kit.write(kit.editors()[1], "No.");
		expect(block.button("Deny").disabled).toBe(false);
	});

	test("each answer keeps its own edited reply", async () => {
		const block = mount();
		await kit.write(kit.editors()[0], "Welcome in");
		await block.choose("Deny");
		await kit.write(kit.editors()[1], "Sorry, no");
		await block.choose("Approve");
		await block.click("Approve");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({
			reply: { text: "Welcome in" },
		});
	});
});

describe("states", () => {
	test("a request with its own buttons: both answers off, and the way to Slack", () => {
		const block = mount({
			view: fx.requestOwnButtonsView,
			actions: fx.off(
				fx.off(fx.requestActions, "approve", fx.OWN_BUTTONS),
				"deny",
				fx.OWN_BUTTONS,
			),
		});
		expect(block.button("Approve").disabled).toBe(true);
		expect(block.button("Deny").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(false);
		expect(kit.editors()).toHaveLength(0);
		expect(
			block.getByRole("link", { name: "Open in Slack" }).className,
		).toContain("border");
	});

	test("leave it", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("settled: the request and the grant, with no controls", () => {
		const block = mount({ done: true });
		expect(block.container.textContent).toContain("for the launch review?");
		expect(block.container.querySelector("[data-grant]")).toBeTruthy();
		expect(kit.editors()).toHaveLength(0);
		expect(block.queryByRole("radio")).toBeNull();
		expect(block.queryByRole("button", { name: "Approve" })).toBeNull();
		expect(block.queryByRole("button", { name: "Leave it" })).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Approve").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(true);
		expect(
			(block.getByRole("radio", { name: "Deny" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({
			failure:
				"Added Casey Nguyen to #leadership. The reply was not sent: Slack did not answer",
		});
		expect(block.getByRole("alert").textContent).toContain(
			"The reply was not sent",
		);
	});
});
