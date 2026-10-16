import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../githubFixtures");
const { GithubDeploymentBlock } = await import("./GithubDeploymentBlock");

type Props = Parameters<typeof GithubDeploymentBlock>[0];

const mount = (props: Partial<Props> = {}) =>
	kit.mount(GithubDeploymentBlock, {
		view: fx.deploymentTwoView,
		actions: fx.deploymentActions,
		...props,
	});

const box = (block: ReturnType<typeof mount>, name: string) =>
	block.getByRole("checkbox", { name }) as HTMLButtonElement;
const check = (block: ReturnType<typeof mount>, name: string) =>
	kit.act(async () => {
		kit.fireEvent.click(box(block, name));
	});
const checked = (block: ReturnType<typeof mount>, name: string) =>
	box(block, name).getAttribute("aria-checked") === "true";
const APPROVE = (names: string) =>
	`Approve the deployment to ${names} of Deploy #318 (release/2.4.0 at 9f2c41d) on lumen-labs/app?`;
const REJECT = (names: string) =>
	`Reject the deployment to ${names} of Deploy #318 (release/2.4.0 at 9f2c41d) on lumen-labs/app?`;
const { staging, production, appStore } = fx;

describe("the run and what it waits on", () => {
	test("title, workflow, branch, actor, and each environment with its reviewers", () => {
		const block = mount({ view: fx.deploymentTimerView });
		expect(
			(
				block.getByRole("link", {
					name: "Release desktop 2.4.0",
				}) as HTMLAnchorElement
			).href,
		).toBe(fx.deploymentView.run.url);
		expect(block.getByText("Deploy #318")).toBeTruthy();
		expect(block.getByText("release/2.4.0")).toBeTruthy();
		expect(block.getByText("avery-chen")).toBeTruthy();
		expect(block.getByText("Wait timer: 15 minutes")).toBeTruthy();
		expect(block.getByText("riley-morgan")).toBeTruthy();
		expect(block.getByText("release-managers")).toBeTruthy();
	});

	test("a wait of one minute reads as one", () => {
		const block = mount({
			view: {
				...fx.deploymentView,
				environments: [{ ...fx.production, waitTimer: 1 }],
			},
		});
		expect(block.getByText("Wait timer: 1 minute")).toBeTruthy();
	});

	test("no wait timer, none shown", () => {
		expect(mount().queryByText(/Wait timer/)).toBeNull();
	});
});

describe("approve and reject", () => {
	test("every environment the reader may approve starts checked, and both go in the sentence and the input", async () => {
		const block = mount();
		expect(checked(block, "staging")).toBe(true);
		expect(checked(block, "production")).toBe(true);
		await block.click("Approve and deploy");
		expect(block.question()).toBe(APPROVE("staging, production"));
		expect(block.onAct.mock.calls).toEqual([]);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["approve", { environments: [staging.id, production.id], comment: "" }],
		]);
	});

	test("unchecking one takes it out of the sentence and the input together", async () => {
		const block = mount();
		await check(block, "staging");
		await block.type("Leave a comment", "  Ship it after the standup  ");
		await block.click("Approve and deploy");
		expect(block.question()).toBe(APPROVE("production"));
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"approve",
				{ environments: [production.id], comment: "Ship it after the standup" },
			],
		]);
	});

	test("checked again, the names keep the run's order", async () => {
		const block = mount();
		await check(block, "staging");
		await check(block, "staging");
		await block.click("Reject");
		expect(block.question()).toBe(REJECT("staging, production"));
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["reject", { environments: [staging.id, production.id], comment: "" }],
		]);
	});

	test("Reject names what is checked", async () => {
		const block = mount();
		await check(block, "production");
		await block.click("Reject");
		expect(block.question()).toBe(REJECT("staging"));
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["reject", { environments: [staging.id], comment: "" }],
		]);
	});

	test("an environment the reader does not review cannot be checked and is never sent", async () => {
		const block = mount({ view: fx.deploymentMixedView });
		expect(box(block, "app-store").disabled).toBe(true);
		expect(checked(block, "app-store")).toBe(false);
		await block.click("Approve and deploy");
		expect(block.question()).toBe(APPROVE("production"));
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["approve", { environments: [production.id], comment: "" }],
		]);
		expect(appStore.canApprove).toBe(false);
	});

	test("nothing checked, nothing to approve or reject", async () => {
		const block = mount({ view: fx.deploymentView });
		await check(block, "production");
		expect(block.button("Approve and deploy").disabled).toBe(true);
		expect(block.button("Reject").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(false);
	});

	test("the comment stops at GitHub's limit", () => {
		const block = mount();
		expect(
			(block.getByLabelText("Leave a comment") as HTMLTextAreaElement)
				.maxLength,
		).toBe(500);
	});
});

describe("nothing to do", () => {
	test("no environment waits: both are off and there is no form", () => {
		const block = mount({
			view: fx.deploymentNoneView,
			actions: fx.deploymentNoneActions,
		});
		expect(block.button("Approve and deploy").disabled).toBe(true);
		expect(block.button("Reject").disabled).toBe(true);
		expect(block.queryByLabelText("Leave a comment")).toBeNull();
		expect(block.queryAllByRole("checkbox")).toEqual([]);
	});

	test("while an action runs everything is off", () => {
		const block = mount({ pending: true });
		expect(box(block, "staging").disabled).toBe(true);
		expect(
			(block.getByLabelText("Leave a comment") as HTMLTextAreaElement).disabled,
		).toBe(true);
		expect(block.button("Approve and deploy").disabled).toBe(true);
	});

	test("a resolved card keeps the list, read-only, with no actions", () => {
		const block = mount({ done: true });
		expect(box(block, "staging").disabled).toBe(true);
		expect(block.queryByLabelText("Leave a comment")).toBeNull();
		expect(
			block.queryAllByRole("button", { name: /Approve|Reject|Leave/ }),
		).toEqual([]);
	});

	test("Leave it dismisses", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});
