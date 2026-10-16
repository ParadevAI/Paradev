import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../slackApprovalFixtures");
const { SlackChannelBlock } = await import("./SlackChannelBlock");

type Props = Parameters<typeof SlackChannelBlock>[0];
const mount = (props: Pick<Props, "view" | "actions"> & Partial<Props>) =>
	kit.mount(SlackChannelBlock, props);
const invite = (props: Partial<Props> = {}) =>
	mount({ view: fx.inviteView, actions: fx.inviteActions, ...props });
const create = (props: Partial<Props> = {}) =>
	mount({ view: fx.createView, actions: fx.createActions, ...props });
const connect = (props: Partial<Props> = {}) =>
	mount({ view: fx.connectView, actions: fx.connectActions, ...props });
const invitees = (block: ReturnType<typeof mount>) =>
	[...block.container.querySelectorAll("[data-invitee]")].map((row) =>
		row.getAttribute("data-invitee"),
	);

describe("add people to a channel", () => {
	test("names who is added and where, and leaves out people already in", async () => {
		const block = invite();
		expect(block.getByText("4 members")).toBeTruthy();
		expect(block.getByText("Guest")).toBeTruthy();
		expect(block.getByText("Already in this channel")).toBeTruthy();
		expect(
			block.getByRole("link", { name: "Open in Slack" }).getAttribute("href"),
		).toBe("https://superset.slack.com/archives/C0TESTAGNT1");
		await block.click("Add");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe("Add Blake and Sam Ortega to #test-agents?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"invite",
				{ channel: fx.testAgents.id, users: [fx.blake.id, fx.sam.id] },
			],
		]);
	});

	test("a person is removed and another added from the directory", async () => {
		const block = invite();
		await block.click("Remove Sam Ortega");
		await block.click("Add people");
		expect(
			kit.options().map((text) => /Casey|Riley|Sam|Quinn/.exec(text)?.[0]),
		).toEqual(["Casey", "Riley", "Sam", "Quinn"]);
		await block.type("Find people", "case");
		await kit.key("Find people", "Enter");
		expect(invitees(block)).toEqual([fx.blake.id, fx.avery.id, fx.casey.id]);
		await block.click("Add");
		expect(block.question()).toBe(
			"Add Blake and Casey Nguyen to #test-agents?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			channel: fx.testAgents.id,
			users: [fx.blake.id, fx.casey.id],
		});
	});

	test("past three people the rest are a count", async () => {
		const block = invite({
			view: {
				...fx.inviteView,
				invitees: [fx.blake, fx.sam, fx.casey, fx.riley, fx.avery].map(
					(person) => ({ person, guest: false, alreadyMember: false }),
				),
			},
		});
		await block.click("Add");
		expect(block.question()).toBe(
			"Add Blake, Sam Ortega, Casey Nguyen, and 2 more to #test-agents?",
		);
	});

	test("nobody left to add: the button is off", async () => {
		const block = invite({ view: fx.inviteNobodyView });
		expect(block.button("Add").disabled).toBe(true);
		kit.cleanup();
		const emptied = invite();
		await emptied.click("Remove Blake");
		await emptied.click("Remove Sam Ortega");
		expect(emptied.button("Add").disabled).toBe(true);
	});

	test("a private channel shared with another organization is marked", () => {
		const block = invite({ view: fx.invitePrivateView });
		expect(
			block.container.querySelector("[data-channel-kind=private]"),
		).toBeTruthy();
		expect(block.getByText("External")).toBeTruthy();
	});

	test("an archived channel", () => {
		const block = invite({
			actions: fx.off(fx.inviteActions, "invite", "That channel is archived"),
		});
		expect(block.button("Add").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(false);
	});
});

describe("create a channel", () => {
	test("the agent's name, visibility and people; the reader is not counted", async () => {
		const block = create();
		expect((block.getByLabelText("Name") as HTMLInputElement).value).toBe(
			"launch-133",
		);
		expect(
			block
				.getByRole("radio", { name: "Private" })
				.getAttribute("aria-checked"),
		).toBe("true");
		expect(block.getByText("Anyone in Superset")).toBeTruthy();
		await block.click("Create");
		expect(block.question()).toBe(
			"Create private channel #launch-133 and add 2 people?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"create",
				{
					name: "launch-133",
					private: true,
					users: [fx.avery.id, fx.blake.id],
				},
			],
		]);
	});

	test("public, with one person and with none", async () => {
		const block = create();
		await block.choose("Public");
		await block.click("Remove Blake");
		await block.click("Create");
		expect(block.question()).toBe(
			"Create public channel #launch-133 and add 1 person?",
		);
		kit.cleanup();

		const alone = create({ view: { ...fx.createView, invitees: [] } });
		await alone.choose("Public");
		await alone.click("Create");
		expect(alone.question()).toBe("Create public channel #launch-133?");
		await alone.confirm();
		expect(alone.onAct.mock.calls[0]?.[1]).toEqual({
			name: "launch-133",
			private: false,
			users: [],
		});
		kit.cleanup();

		const closed = create({ view: { ...fx.createView, invitees: [] } });
		await closed.click("Create");
		expect(closed.question()).toBe("Create private channel #launch-133?");
	});

	test("the name is lowercased as typed, spaces become hyphens, 80 at most", async () => {
		const block = create();
		await block.type("Name", "Launch Review Q4");
		expect((block.getByLabelText("Name") as HTMLInputElement).value).toBe(
			"launch-review-q4",
		);
		await block.type("Name", "x".repeat(90));
		expect(
			(block.getByLabelText("Name") as HTMLInputElement).value,
		).toHaveLength(80);
	});

	test("the name rule shows for a character Slack refuses, and the button is off", async () => {
		const RULE =
			"Channel names can’t contain spaces or punctuation. Use dashes to separate words.";
		const block = create();
		expect(block.queryByText(RULE)).toBeNull();
		for (const name of ["launch!", "a.b", "launch#1"]) {
			await block.type("Name", name);
			expect(block.getByText(RULE)).toBeTruthy();
			expect(block.button("Create").disabled).toBe(true);
		}
		await block.type("Name", "");
		expect(block.queryByText(RULE)).toBeNull();
		expect(block.button("Create").disabled).toBe(true);
		await block.type("Name", "launch_1-ß");
		expect(block.queryByText(RULE)).toBeNull();
		expect(block.button("Create").disabled).toBe(false);
	});
});

describe("Slack Connect invitation", () => {
	test("states who is invited, where, and that they are outside", async () => {
		const block = connect();
		expect(block.getByText("People outside Superset")).toBeTruthy();
		await block.click("Send invitation");
		expect(block.question()).toBe(
			"Invite dana@northwind.example to #test-agents through Slack Connect? They are outside Superset.",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"connect",
				{ channel: fx.testAgents.id, emails: ["dana@northwind.example"] },
			],
		]);
	});

	test("an address is added with Enter, and one is removed", async () => {
		const block = connect();
		await block.type("Email address", "eli@northwind.example");
		await kit.key("Email address", "Enter");
		expect(
			(block.getByLabelText("Email address") as HTMLInputElement).value,
		).toBe("");
		await block.click("Remove dana@northwind.example");
		await block.click("Send invitation");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			channel: fx.testAgents.id,
			emails: ["eli@northwind.example"],
		});
	});

	test("one address at a time, and it has to be one", async () => {
		const block = connect();
		for (const bad of [
			"eli",
			"eli@northwind",
			"a@b.co, c@d.co",
			"eli @northwind.example",
		]) {
			await block.type("Email address", bad);
			await block.click("Add");
			expect(block.getByText("Enter one email address")).toBeTruthy();
		}
		await block.type("Email address", "eli@northwind.example");
		expect(block.queryByText("Enter one email address")).toBeNull();
		await block.click("Add");
		await block.click("Send invitation");
		expect(block.question()).toBe(
			"Invite dana@northwind.example and eli@northwind.example to #test-agents through Slack Connect? They are outside Superset.",
		);
	});

	test("no address left: the button is off", async () => {
		const block = connect();
		await block.click("Remove dana@northwind.example");
		expect(block.button("Send invitation").disabled).toBe(true);
	});

	test("the app is not in the channel: off for the server's reason", () => {
		const block = connect({
			view: { ...fx.connectView, appInChannel: false },
			actions: fx.off(fx.connectActions, "connect", fx.APP_NOT_IN_CHANNEL),
		});
		expect(block.button("Send invitation").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(false);
	});
});

describe("states", () => {
	test("leave it, in every mode", async () => {
		for (const open of [invite, create, connect]) {
			const block = open();
			await block.click("Leave it");
			expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
			kit.cleanup();
		}
	});

	test("settled: the facts stay and the controls go", () => {
		const added = invite({ done: true });
		expect(invitees(added)).toHaveLength(3);
		expect(added.queryByRole("button")).toBeNull();
		kit.cleanup();
		const created = create({ done: true });
		expect(created.getByText("launch-133")).toBeTruthy();
		expect(created.queryByRole("button")).toBeNull();
		expect(created.queryByLabelText("Name")).toBeNull();
		kit.cleanup();
		const connected = connect({ done: true });
		expect(connected.getByText("dana@northwind.example")).toBeTruthy();
		expect(connected.queryByRole("button")).toBeNull();
		expect(connected.queryByLabelText("Email address")).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = create({ pending: true });
		expect(block.button("Create").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(true);
		expect(block.button("Add people").disabled).toBe(true);
		expect((block.getByLabelText("Name") as HTMLInputElement).disabled).toBe(
			true,
		);
	});

	test("failure is an alert", () => {
		const block = create({
			failure: "A channel with that name exists already",
		});
		expect(block.getByRole("alert").textContent).toBe(
			"A channel with that name exists already",
		);
	});
});
