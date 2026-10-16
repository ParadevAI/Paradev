import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../githubFixtures");
const { GithubReleaseBlock } = await import("./GithubReleaseBlock");

type Props = Parameters<typeof GithubReleaseBlock>[0];

const mount = (props: Partial<Props> = {}) =>
	kit.mount(GithubReleaseBlock, {
		view: fx.releaseView,
		actions: fx.releaseActions,
		...props,
	});

const INPUT = {
	sha: fx.HEAD_SHA,
	name: "v2.4.0",
	notes: fx.RELEASE_NOTES,
	prerelease: false,
	latest: true,
};
const latest = (block: ReturnType<typeof mount>) =>
	block.getByRole("checkbox", {
		name: "Set as the latest release",
	}) as HTMLButtonElement;
const tick = (box: HTMLElement) =>
	kit.act(async () => {
		kit.fireEvent.click(box);
	});
const prerelease = (block: ReturnType<typeof mount>) =>
	block.getByRole("checkbox", { name: "Set as a pre-release" }) as HTMLElement;
const notes = (block: ReturnType<typeof mount>) =>
	(block.getByLabelText("Release notes") as HTMLTextAreaElement).value;

describe("the release as drafted", () => {
	test("a new tag, its target, and the commits since the last release", () => {
		const block = mount();
		expect(block.getByText("v2.4.0")).toBeTruthy();
		expect(block.container.querySelector("[data-tag-state]")?.textContent).toBe(
			"New tag on main at 9f2c41d",
		);
		expect(
			(
				block.getByRole("link", {
					name: "8 commits since v2.3.1",
				}) as HTMLAnchorElement
			).href,
		).toBe(fx.releaseView.compareUrl as string);
		expect((block.getByLabelText("Title") as HTMLInputElement).value).toBe(
			"v2.4.0",
		);
		expect(block.container.querySelectorAll("ul.rounded-md > li").length).toBe(
			8,
		);
		expect(block.queryByText(/and \d+ more/)).toBeNull();
	});

	test("one commit since the last release reads as one", () => {
		const block = mount({
			view: {
				...fx.releaseView,
				commits: fx.releaseView.commits.slice(0, 1),
				total: 1,
			},
		});
		expect(
			block.getByRole("link", { name: "1 commit since v2.3.1" }),
		).toBeTruthy();
	});

	test("a tag that exists, and more commits than are listed", () => {
		const existing = mount({ view: fx.releaseExistingTagView });
		expect(
			existing.container.querySelector("[data-tag-state]")?.textContent,
		).toBe("Existing tag at 9f2c41d");
		kit.cleanup();
		const many = mount({ view: fx.releasePrereleaseView });
		expect(many.getByText("and 29 more")).toBeTruthy();
		expect(prerelease(many).getAttribute("aria-checked")).toBe("true");
	});
});

describe("publish and draft", () => {
	test("Publish names the title and the new tag, and sends what the reader saw", async () => {
		const block = mount();
		await block.click("Publish release");
		expect(block.question()).toBe(
			'Publish the release "v2.4.0" on lumen-labs/app, with the new tag v2.4.0 on main at 9f2c41d? It becomes the latest release.',
		);
		expect(block.onAct.mock.calls).toEqual([]);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["publish", INPUT]]);
	});

	test("Save draft says nothing is published", async () => {
		const block = mount();
		await block.click("Save draft");
		expect(block.question()).toBe(
			'Save "v2.4.0" as a draft release on lumen-labs/app, with the new tag v2.4.0 on main at 9f2c41d? Nothing is published.',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["draft", INPUT]]);
	});

	test("an edited title, notes and pre-release change the sentence and the input together", async () => {
		const block = mount();
		await block.type("Title", "  Lumen 2.4  ");
		await block.click("Edit");
		await block.type("Release notes", "Steadier sync.");
		await tick(prerelease(block));
		expect(latest(block).disabled).toBe(true);
		expect(latest(block).getAttribute("aria-checked")).toBe("false");
		await block.click("Publish release");
		expect(block.question()).toBe(
			'Publish the release "Lumen 2.4" on lumen-labs/app, with the new tag v2.4.0 on main at 9f2c41d? It is marked as a pre-release.',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"publish",
				{
					...INPUT,
					name: "Lumen 2.4",
					notes: "Steadier sync.",
					prerelease: true,
					latest: false,
				},
			],
		]);
	});

	test("a draft of a pre-release says so too", async () => {
		const block = mount();
		await tick(prerelease(block));
		await block.click("Save draft");
		expect(block.question()).toBe(
			'Save "v2.4.0" as a draft release on lumen-labs/app, with the new tag v2.4.0 on main at 9f2c41d? Nothing is published. It is marked as a pre-release.',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["draft", { ...INPUT, prerelease: true, latest: false }],
		]);
	});

	test("not the latest: the sentence stops saying it and the input says so", async () => {
		const block = mount();
		await tick(latest(block));
		await block.click("Publish release");
		expect(block.question()).toBe(
			'Publish the release "v2.4.0" on lumen-labs/app, with the new tag v2.4.0 on main at 9f2c41d?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["publish", { ...INPUT, latest: false }],
		]);
	});

	test("a release the agent proposed as not the latest starts that way", async () => {
		const block = mount({ view: { ...fx.releaseView, latest: false } });
		expect(latest(block).getAttribute("aria-checked")).toBe("false");
		await block.click("Publish release");
		expect(block.question()).toBe(
			'Publish the release "v2.4.0" on lumen-labs/app, with the new tag v2.4.0 on main at 9f2c41d?',
		);
	});

	test("an existing tag is named as such", async () => {
		const block = mount({ view: fx.releaseExistingTagView });
		await block.click("Publish release");
		expect(block.question()).toBe(
			'Publish the release "v2.4.0" on lumen-labs/app, tagged v2.4.0 at 9f2c41d? It becomes the latest release.',
		);
	});

	test("no title, no release", async () => {
		const block = mount();
		await block.type("Title", "   ");
		expect(block.button("Publish release").disabled).toBe(true);
		expect(block.button("Save draft").disabled).toBe(true);
		expect(block.button("Generate release notes").disabled).toBe(false);
	});

	test("a release GitHub already has: both are off, nothing to generate, and the way to it", () => {
		const block = mount({ view: fx.releasedView, actions: fx.releasedActions });
		expect(block.button("Publish release").disabled).toBe(true);
		expect(block.button("Save draft").disabled).toBe(true);
		expect(
			block.queryByRole("button", { name: "Generate release notes" }),
		).toBeNull();
		expect(
			(
				block.getByRole("link", {
					name: "View on GitHub",
				}) as HTMLAnchorElement
			).href,
		).toBe("https://github.com/lumen-labs/app/releases/tag/v2.4.0");
	});
});

describe("generate release notes", () => {
	const again = (block: ReturnType<typeof mount>) =>
		block.rerender(
			<kit.TooltipProvider>
				<GithubReleaseBlock
					view={{ ...fx.releaseView, notes: fx.GENERATED_NOTES }}
					actions={fx.releaseActions}
					done={false}
					pending={false}
					failure={null}
					onAct={block.onAct}
				/>
			</kit.TooltipProvider>,
		);

	test("asks nothing when there are no notes to lose", async () => {
		const block = mount();
		await block.click("Generate release notes");
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([["generate"]]);
	});

	test("asks the plan's question when it replaces drafted notes", async () => {
		const block = mount({ view: fx.releaseDraftedNotesView });
		await block.click("Generate release notes");
		expect(block.question()).toBe(fx.REPLACE_NOTES);
		expect(block.onAct.mock.calls).toEqual([]);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["generate"]]);
	});

	test("notes the reader has not touched become GitHub's", async () => {
		const block = mount();
		again(block);
		await block.click("Edit");
		expect(notes(block)).toBe(fx.GENERATED_NOTES);
		await block.click("Publish release");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["publish", { ...INPUT, notes: fx.GENERATED_NOTES }],
		]);
	});

	test("notes the reader edited stay theirs", async () => {
		const block = mount();
		await block.click("Edit");
		await block.type("Release notes", "My own words.");
		again(block);
		expect(notes(block)).toBe("My own words.");
	});
});

describe("endings", () => {
	test("Do not release dismisses", async () => {
		const block = mount();
		await block.click("Do not release");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("a resolved card is read-only with no actions", () => {
		const block = mount({ done: true });
		expect((block.getByLabelText("Title") as HTMLInputElement).disabled).toBe(
			true,
		);
		expect(block.button("Edit").disabled).toBe(true);
		expect((prerelease(block) as HTMLButtonElement).disabled).toBe(true);
		expect(latest(block).disabled).toBe(true);
		expect(block.queryByRole("button", { name: "Publish release" })).toBeNull();
	});

	test("while an action runs everything is off", () => {
		const block = mount({ pending: true });
		expect((block.getByLabelText("Title") as HTMLInputElement).disabled).toBe(
			true,
		);
		expect(block.button("Generate release notes").disabled).toBe(true);
		expect(block.button("Publish release").disabled).toBe(true);
	});
});
