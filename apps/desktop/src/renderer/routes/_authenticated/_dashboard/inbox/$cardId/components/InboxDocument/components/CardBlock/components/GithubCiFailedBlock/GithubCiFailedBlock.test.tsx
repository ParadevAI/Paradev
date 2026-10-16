import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../githubFixtures");
const { GithubCiFailedBlock } = await import("./GithubCiFailedBlock");

type Props = Parameters<typeof GithubCiFailedBlock>[0];
type StartProps = import("react").ComponentProps<Props["StartAgent"]>;

let started: StartProps | null = null;
function StartAgent(props: StartProps) {
	started = props;
	return props.trigger;
}
const Block = (props: Omit<Props, "StartAgent">) => (
	<GithubCiFailedBlock {...props} StartAgent={StartAgent} />
);
const mount = (props: Partial<Props> = {}) => {
	started = null;
	return kit.mount(Block, {
		view: fx.ciView,
		actions: fx.ciActions,
		...props,
	});
};
const off = (actions: Props["actions"], reason: string, ...ids: string[]) =>
	actions.map((action) =>
		ids.includes(action.id) ? { ...action, disabled: reason } : action,
	);

const SHA = { sha: fx.HEAD_SHA };

describe("what failed", () => {
	test("the pull request, the count, the job, its step, errors, annotations and log", () => {
		const block = mount();
		expect(block.getByText("Open")).toBeTruthy();
		expect(block.getByText(fx.pull.title)).toBeTruthy();
		expect(
			(
				block.getByRole("link", {
					name: "lumen-labs/app#482",
				}) as HTMLAnchorElement
			).href,
		).toBe(fx.pull.url);
		expect(block.getByText("avery/sync-lease-retry → main")).toBeTruthy();
		expect(block.getByText("1 of 14 checks failing")).toBeTruthy();
		expect(block.queryByText(/still running/)).toBeNull();
		expect(block.getByText("Attempt 1")).toBeTruthy();
		expect(block.getByText("Step 6: Test")).toBeTruthy();
		expect(block.getByText("Process completed with exit code 1.")).toBeTruthy();
		expect(
			block.getByText("packages/sync/src/queue/retry.test.ts:16"),
		).toBeTruthy();
		expect(block.container.querySelector("pre")?.textContent).toBe(
			fx.testJob.log,
		);
	});

	test("every run with its attempt, checks still running, and a check from another app as a link", () => {
		const block = mount({ view: fx.ciTwoRunsView });
		expect(block.getByText("3 of 14 checks failing")).toBeTruthy();
		expect(block.getByText("2 still running")).toBeTruthy();
		expect(block.getByText("Attempt 2")).toBeTruthy();
		expect(block.getByText("Step 4: Biome")).toBeTruthy();
		expect(block.container.querySelectorAll("[data-job]").length).toBe(2);
		expect(
			(block.getByRole("link", { name: "Vercel – app" }) as HTMLAnchorElement)
				.href,
		).toBe("https://vercel.example/lumen-labs/app");
	});

	test("a run that is going again says so, and jobs left out are counted", () => {
		const block = mount({
			view: {
				...fx.ciTwoRunsView,
				runs: fx.ciTwoRunsView.runs.map((run, index) => ({
					...run,
					running: index === 0,
				})),
				omitted: 6,
			},
		});
		expect(
			[...block.container.querySelectorAll("[data-run]")].map(
				(each) => each.firstElementChild?.textContent,
			),
		).toEqual(["CI #1204Attempt 2Running", "Lint #877Attempt 1"]);
		expect(block.container.querySelector("[data-omitted]")?.textContent).toBe(
			"and 6 more failed jobs",
		);
	});

	test("the log opens at its end, where the error is", () => {
		const height = Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"scrollHeight",
		);
		Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
			configurable: true,
			get: () => 480,
		});
		try {
			const block = mount();
			expect(block.container.querySelector("pre")?.scrollTop).toBe(480);
		} finally {
			if (height)
				Object.defineProperty(HTMLElement.prototype, "scrollHeight", height);
			else
				delete (HTMLElement.prototype as { scrollHeight?: number })
					.scrollHeight;
		}
	});

	test("counts of one read as one", () => {
		const block = mount({ view: { ...fx.ciView, total: 1, omitted: 1 } });
		expect(block.getByText("1 of 1 check failing")).toBeTruthy();
		expect(block.getByText("and 1 more failed job")).toBeTruthy();
	});

	test("a check with no page is plain text", () => {
		const block = mount({ view: fx.ciExternalOnlyView });
		expect(block.queryByRole("link", { name: "license/cla" })).toBeNull();
		expect(block.getByText("license/cla")).toBeTruthy();
		expect(block.container.querySelector("pre")).toBeNull();
		expect(block.container.querySelector("[data-omitted]")).toBeNull();
	});
});

describe("re-run", () => {
	test("the failed jobs, after the server's question, for the commit the reader saw", async () => {
		const block = mount();
		await block.click("Re-run failed jobs");
		expect(block.question()).toBe(fx.RERUN_FAILED_CONFIRM);
		expect(block.onAct.mock.calls).toEqual([]);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["rerun_failed", SHA]]);
	});

	test("all jobs, after the server's question", async () => {
		const block = mount();
		await block.click("Re-run all jobs");
		expect(block.question()).toBe(fx.RERUN_ALL_CONFIRM);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["rerun_all", SHA]]);
	});

	test("off when the server turns them off, and while another action runs", () => {
		const block = mount({
			actions: off(
				fx.ciActions,
				fx.CI_STILL_RUNNING,
				"rerun_failed",
				"rerun_all",
			),
		});
		expect(block.button("Re-run failed jobs").disabled).toBe(true);
		expect(block.button("Re-run all jobs").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(false);
		kit.cleanup();
		const busy = mount({ pending: true });
		expect(busy.button("Re-run failed jobs").disabled).toBe(true);
		expect(busy.button("Start an agent to fix it").disabled).toBe(true);
	});
});

describe("other ways on", () => {
	test("an agent starts on the server's task, and the card learns the workspace", () => {
		const block = mount();
		expect(started?.tasks).toEqual([
			{
				id: "lumen-labs/app#482",
				slug: fx.ciView.fix.slug,
				title: fx.ciView.fix.title,
				description: fx.ciView.fix.prompt,
				branch: null,
				linked: false,
			},
		]);
		started?.onCreated?.(["ws_1"]);
		expect(block.onAct.mock.calls).toEqual([
			["started", { workspace: "ws_1" }],
		]);
	});

	test("no agent when the server offers none", () => {
		const block = mount({
			actions: fx.ciActions.filter((action) => action.id !== "started"),
		});
		expect(started).toBeNull();
		expect(
			block.queryByRole("button", { name: "Start an agent to fix it" }),
		).toBeNull();
	});

	test("no workspace made, nothing told", () => {
		const block = mount();
		started?.onCreated?.([]);
		expect(block.onAct.mock.calls).toEqual([]);
	});

	test("Leave it dismisses with no question", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("a resolved card has no actions, and a failure is shown", () => {
		const done = mount({ done: true });
		expect(done.queryAllByRole("button")).toEqual([]);
		kit.cleanup();
		const failed = mount({ failure: "GitHub did not answer. Try again" });
		expect(failed.getByRole("alert").textContent).toBe(
			"GitHub did not answer. Try again",
		);
	});
});
