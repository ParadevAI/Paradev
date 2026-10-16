import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../slackApprovalFixtures");
const { SlackPostBlock } = await import("./SlackPostBlock");

type Props = Parameters<typeof SlackPostBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(SlackPostBlock, {
		view: fx.postView,
		actions: fx.postActions,
		...props,
	});
const sent = (block: ReturnType<typeof mount>) =>
	block.onAct.mock.calls[0]?.[1] as Record<string, unknown>;
const PICKER = "Find a channel or person";

describe("send now", () => {
	test("the draft goes to the channel with no dialog", async () => {
		const block = mount();
		expect(block.getByText("test-agents")).toBeTruthy();
		await block.click("Send");
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([
			[
				"send",
				{
					text: "The *1.33* release note is ready, please skim it :shipit:",
					blocks: [
						{
							type: "rich_text",
							elements: [
								{
									type: "rich_text_section",
									elements: [
										{ type: "text", text: "The " },
										{ type: "text", text: "1.33", style: { bold: true } },
										{
											type: "text",
											text: " release note is ready, please skim it ",
										},
										{ type: "emoji", name: "shipit" },
									],
								},
							],
						},
					],
					to: fx.testAgents.id,
					postAt: null,
				},
			],
		]);
	});

	test("the reader's edit is what goes out", async () => {
		const block = mount();
		await kit.write(kit.editors()[0], "Out now");
		await block.click("Send");
		expect(sent(block)).toMatchObject({ text: "Out now", postAt: null });
	});

	test("nothing written: send is off", async () => {
		const block = mount({ view: { ...fx.postView, draft: "" } });
		expect(block.button("Send").disabled).toBe(true);
		await kit.write(kit.editors()[0], "Hello");
		expect(block.button("Send").disabled).toBe(false);
	});
});

describe("a message that notifies people", () => {
	test("@channel in the draft asks first with the count, and sends it back", async () => {
		const block = mount({ view: fx.broadcastPostView });
		await block.click("Send");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			"Send this to #test-agents? It notifies 3 people there.",
		);
		await block.confirm();
		expect(sent(block)).toMatchObject({
			text: "The *1.33* release note is ready. <!channel> please skim it.",
			to: fx.testAgents.id,
			notifies: 3,
		});
		expect(JSON.stringify(sent(block).blocks)).toContain(
			'{"type":"broadcast","range":"channel"}',
		);
	});

	test("a typed @here asks too", async () => {
		const block = mount({ view: { ...fx.postView, notifies: 1 } });
		await kit.write(kit.editors()[0], "@here lunch is in");
		await block.click("Send");
		expect(block.question()).toBe(
			"Send this to #test-agents? It notifies 1 person there.",
		);
		await block.confirm();
		expect(sent(block)).toMatchObject({
			text: "<!here> lunch is in",
			notifies: 1,
		});
	});

	test("an address or code that only looks like a broadcast does not ask", async () => {
		const block = mount();
		await kit.write(kit.editors()[0], "mail team@here.dev or ask @hereafter");
		await block.click("Send");
		expect(block.question()).toBeNull();
		expect(sent(block)).not.toHaveProperty("notifies");
	});

	test("a user group asks with the group's size", async () => {
		const block = mount({ view: fx.groupMentionPostView });
		await block.click("Send");
		expect(block.question()).toBe(
			"Send this to #test-agents? It notifies 5 people in @eng.",
		);
		await block.confirm();
		expect(sent(block)).toMatchObject({
			text: "<!subteam^S0ENG> the release build is green.",
			groupNotifies: 5,
		});
		expect(sent(block)).not.toHaveProperty("notifies");
	});

	test("a broadcast in a DM has no count to state", async () => {
		const block = mount({ view: fx.dmPostView });
		await kit.write(kit.editors()[0], "@channel ping");
		await block.click("Send");
		expect(block.question()).toBe(
			"Send this to Blake? It notifies everyone there.",
		);
		await block.confirm();
		expect(sent(block)).toMatchObject({ to: fx.blake.id, notifies: null });
	});

	test("a scheduled broadcast states the time", async () => {
		const block = mount({
			view: { ...fx.broadcastPostView, postAt: fx.later(1, 9 * 60) },
		});
		await block.click("Schedule for Oct 2 at 9:00 AM");
		expect(block.question()).toBe(
			"Schedule this for #test-agents on Oct 2 at 9:00 AM? It notifies 3 people there.",
		);
	});
});

describe("schedule", () => {
	test("the agent's time is chosen and the button says so; no dialog", async () => {
		const block = mount({ view: fx.scheduledPostView });
		await block.click("Schedule for Oct 2 at 9:00 AM");
		expect(block.question()).toBeNull();
		expect(sent(block)).toMatchObject({ postAt: "2037-10-02T16:00:00.000Z" });
	});

	test("the menu offers tomorrow, Monday and a custom time", async () => {
		const block = mount();
		await block.click("Schedule for later");
		expect(kit.options()).toEqual([
			"Tomorrow at 9:00 AM",
			"Monday at 9:00 AM",
			"Custom time",
		]);
		await kit.option("Monday at 9:00 AM");
		await block.click("Schedule for Oct 5 at 9:00 AM");
		expect(sent(block)).toMatchObject({ postAt: "2037-10-05T16:00:00.000Z" });
	});

	test("a custom time opens the date and time fields an hour ahead", async () => {
		const block = mount();
		await block.click("Schedule for later");
		await kit.option("Custom time");
		expect(block.button("Send date").textContent).toBe("Oct 1, 2037");
		expect(block.button("Send time").textContent).toBe("1:00 PM");
		expect(block.button("Schedule for Oct 1 at 1:00 PM")).toBeTruthy();
	});

	test("Send now takes the time off", async () => {
		const block = mount({ view: fx.scheduledPostView });
		await block.click("Schedule for later");
		expect(kit.options()[0]).toBe("Send now");
		await kit.option("Send now");
		await block.click("Send");
		expect(sent(block)).toMatchObject({ postAt: null });
	});

	test("a time that has passed is refused", () => {
		const block = mount({
			view: { ...fx.postView, postAt: "2037-10-01T18:00:00.000Z" },
		});
		expect(block.getByText("Pick a time in the future")).toBeTruthy();
		expect(block.button("Schedule for Oct 1 at 11:00 AM").disabled).toBe(true);
	});

	test("more than 120 days ahead is refused", () => {
		const block = mount({
			view: { ...fx.postView, postAt: "2038-03-01T18:00:00.000Z" },
		});
		expect(
			block.getByText("Slack schedules messages up to 120 days ahead"),
		).toBeTruthy();
	});

	test("the agent's time had passed when the card was read", () => {
		const block = mount({ view: fx.stalePostView });
		expect(block.getByText("The proposed time has passed")).toBeTruthy();
		expect(block.button("Send").disabled).toBe(false);
	});
});

describe("where it goes", () => {
	test("typing filters, Enter takes the first match: a channel", async () => {
		const block = mount();
		await block.click("Change");
		await block.type(PICKER, "bug");
		expect(kit.options()).toEqual(["bugs"]);
		await kit.key(PICKER, "Enter");
		expect(block.onAct.mock.calls).toEqual([
			["retarget", { to: "C0BUGS00001" }],
		]);
	});

	test("arrows move through channels and people", async () => {
		const block = mount();
		await block.click("Change");
		await block.type(PICKER, "a");
		const listed = kit.options();
		expect(listed.slice(0, 3)).toEqual([
			"general",
			"leadership",
			"partners-northwindExternal",
		]);
		await kit.key(PICKER, "ArrowDown");
		await kit.key(PICKER, "ArrowDown");
		await kit.key(PICKER, "Enter");
		expect(block.onAct.mock.calls).toEqual([
			["retarget", { to: fx.leadership.id }],
		]);
	});

	test("a person from a channel starts a DM", async () => {
		const block = mount();
		await block.click("Change");
		await block.type(PICKER, "blake");
		await kit.key(PICKER, "Enter");
		expect(block.onAct.mock.calls).toEqual([
			["retarget", { to: [fx.blake.id] }],
		]);
	});

	test("a person from a DM makes it a group, and a group loses one", async () => {
		const dm = mount({ view: fx.dmPostView });
		await dm.click("Change");
		await dm.type(PICKER, "casey");
		await kit.key(PICKER, "Enter");
		expect(dm.onAct.mock.calls).toEqual([
			["retarget", { to: [fx.blake.id, fx.casey.id] }],
		]);
		kit.cleanup();

		const group = mount({ view: fx.groupPostView });
		await group.click("Remove Blake");
		expect(group.onAct.mock.calls).toEqual([
			["retarget", { to: [fx.casey.id] }],
		]);
	});

	test("a DM's only person cannot be removed", () => {
		const block = mount({ view: fx.dmPostView });
		expect(block.queryByRole("button", { name: "Remove Blake" })).toBeNull();
	});

	test("a private channel has a lock and a shared one is marked", () => {
		const locked = mount({ view: fx.privatePostView });
		expect(
			locked.container.querySelector("[data-channel-kind=private]"),
		).toBeTruthy();
		kit.cleanup();
		const shared = mount({ view: fx.externalPostView });
		expect(shared.getByText("External")).toBeTruthy();
	});
});

describe("states", () => {
	test("do not send", async () => {
		const block = mount();
		await block.click("Do not send");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("settled: where and what, with no controls", () => {
		const block = mount({ done: true });
		expect(block.getByText("test-agents")).toBeTruthy();
		expect(block.container.textContent).toContain("release note is ready");
		expect(kit.editors()).toHaveLength(0);
		expect(block.queryByRole("button")).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Send").disabled).toBe(true);
		expect(block.button("Do not send").disabled).toBe(true);
		expect(block.button("Change").disabled).toBe(true);
		expect(block.button("Schedule for later").disabled).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "That time has passed" });
		expect(block.getByRole("alert").textContent).toBe("That time has passed");
	});

	test("a channel the reader cannot post to", () => {
		const block = mount({
			actions: fx.off(fx.postActions, "send", "That channel is archived"),
		});
		expect(block.button("Send").disabled).toBe(true);
		expect(block.button("Schedule for later").disabled).toBe(true);
		expect(block.button("Do not send").disabled).toBe(false);
	});
});
