import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, setSystemTime, test } =
	await import("bun:test");
mock.module("renderer/lib/clickPolicy", () => ({
	useUrlLinkAction: () => () => null,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		external: { openUrl: { useMutation: () => ({ mutate: () => {} }) } },
	},
}));
const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	useNavigate: () => () => {},
}));
setSystemTime(new Date("2026-09-30T19:00:00Z"));
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TooltipProvider } = await import("@superset/ui/tooltip");
const fx = await import("../linearFixtures");
const { LinearThreadBlock } = await import("./LinearThreadBlock");

import type { Editor } from "@tiptap/core";

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof LinearThreadBlock>[0];

function mount(overrides: Partial<Props> = {}) {
	const onAct = mock();
	const view = render(
		<TooltipProvider>
			<LinearThreadBlock
				view={fx.threadView}
				actions={fx.threadActions}
				done={false}
				pending={false}
				failure={null}
				onAct={onAct}
				{...overrides}
			/>
		</TooltipProvider>,
	);
	const editor = () =>
		(
			view.container.querySelector(
				"[data-linear-composer] .ProseMirror",
			) as HTMLElement & { editor: Editor }
		).editor;
	const write = (text: string) =>
		act(async () => {
			editor().commands.insertContent(text);
		});
	const send = () =>
		view.getByRole("button", { name: "Send reply" }) as HTMLButtonElement;
	const comment = (id: string) =>
		view.container.querySelector(`[data-comment="${id}"]`) as HTMLElement;
	const reaction = (id: string, emoji: string) =>
		comment(id).querySelector(
			`[data-reaction="${emoji}"]`,
		) as HTMLButtonElement;
	const click = (element: Element) =>
		act(async () => {
			fireEvent.click(element);
		});
	return { ...view, onAct, editor, write, send, comment, reaction, click };
}

const { root, replies } = fx.threadView;
const [reply] = replies;
if (!reply) throw new Error("the thread fixture has a reply");

describe("the thread", () => {
	test("heads with the issue", () => {
		const block = mount();
		expect(block.getByText("AGT-6")).toBeTruthy();
		expect(
			block.getByText("Cloud workspace takes 40 s to open on mobile"),
		).toBeTruthy();
		expect(
			(block.getByRole("link", { name: "Open in Linear" }) as HTMLAnchorElement)
				.href,
		).toBe(fx.threadIssue.url);
	});

	test("the root, then the replies, each with author and age", () => {
		const block = mount();
		const heads = [
			...block.container.querySelectorAll("[data-comment] header"),
		];
		expect(heads.map((head) => head.textContent)).toEqual([
			"MMarcus Oyelaran3 hours ago",
			"LLena Fischer3 hours ago",
		]);
	});

	test("bodies are drawn from markdown, with mentions marked", () => {
		const block = mount();
		expect(block.comment(root.id).querySelector("strong")?.textContent).toBe(
			"after",
		);
		expect(block.comment(root.id).querySelector("pre")?.textContent).toBe(
			'await attach({ restore: "lazy" })\n',
		);
		expect(
			block.comment(reply.id).querySelector("[data-mention]")?.textContent,
		).toBe("@riya");
	});
});

describe("reactions", () => {
	test("chips carry the emoji and count; the reader's own is pressed", () => {
		const block = mount();
		const mine = block.reaction(root.id, "+1");
		expect(mine.textContent).toBe("👍2");
		expect(mine.getAttribute("aria-pressed")).toBe("true");
		const other = block.reaction(reply.id, "eyes");
		expect(other.textContent).toBe("👀1");
		expect(other.getAttribute("aria-pressed")).toBe("false");
	});

	test("a click toggles the reader's reaction", async () => {
		const block = mount();
		await block.click(block.reaction(root.id, "+1"));
		await block.click(block.reaction(reply.id, "eyes"));
		expect(block.onAct.mock.calls).toEqual([
			["react", { comment: root.id, emoji: "+1", on: false }],
			["react", { comment: reply.id, emoji: "eyes", on: true }],
		]);
	});

	test("the add-reaction icon opens the emoji picker", async () => {
		const block = mount();
		await block.click(
			block
				.comment(reply.id)
				.querySelector('[aria-label="Add reaction"]') as Element,
		);
		const search = document.body.querySelector(
			'input[placeholder="Search all emoji"]',
		) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(search, { target: { value: "rocket" } });
		});
		await act(async () => {
			fireEvent.keyDown(search, { key: "Enter" });
		});
		expect(block.onAct.mock.calls).toEqual([
			["react", { comment: reply.id, emoji: "rocket", on: true }],
		]);
	});
});

describe("the reply", () => {
	test("the composer is the thread's reply box", () => {
		const block = mount();
		const box = block.container.querySelector("[data-linear-composer]");
		expect(box?.getAttribute("data-linear-composer")).toBe("reply");
		expect(
			box
				?.querySelector("[data-placeholder]")
				?.getAttribute("data-placeholder"),
		).toBe("Leave a reply…");
	});

	test("an empty box cannot be sent", () => {
		const block = mount();
		expect(block.send().disabled).toBe(true);
	});

	test("sends the markdown with the thread it answers", async () => {
		const block = mount();
		await block.write("Lazy restore **works** for me.");
		await block.click(block.send());
		expect(block.onAct.mock.calls).toEqual([
			[
				"reply",
				{
					body: "Lazy restore **works** for me.",
					root: root.id,
					seen: reply.id,
				},
			],
		]);
	});

	test("starts with the agent's draft, and ⌘Enter sends it", async () => {
		const block = mount({
			view: { ...fx.threadView, draft: "Agreed. @marcus can you ship it?" },
		});
		expect(block.editor().getText()).toBe("Agreed. @marcus can you ship it?");
		await act(async () => {
			block.editor().view.dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					metaKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);
		});
		expect(block.onAct.mock.calls).toEqual([
			[
				"reply",
				{
					body: "Agreed. @marcus can you ship it?",
					root: root.id,
					seen: reply.id,
				},
			],
		]);
	});
});

describe("states", () => {
	test("resolved: the thread stays, the reply box and reacting go", () => {
		const block = mount({ done: true });
		expect(block.comment(root.id)).toBeTruthy();
		expect(block.container.querySelector("[data-linear-composer]")).toBeNull();
		expect(block.reaction(root.id, "+1").disabled).toBe(true);
		expect(
			block.container.querySelector('[aria-label="Add reaction"]'),
		).toBeNull();
	});

	test("pending turns the reply and the reactions off", () => {
		const block = mount({
			pending: true,
			view: { ...fx.threadView, draft: "On it." },
		});
		expect(block.send().disabled).toBe(true);
		expect(block.reaction(root.id, "+1").disabled).toBe(true);
		expect(block.editor().isEditable).toBe(false);
	});

	test("the failure is shown", () => {
		const block = mount({ failure: "The thread has new comments" });
		expect(block.getByRole("alert").textContent).toBe(
			"The thread has new comments",
		);
	});

	test("a reply the reader may not make is off", () => {
		const block = mount({
			view: { ...fx.threadView, draft: "On it." },
			actions: fx.disabledActions(fx.threadActions, "Linear is read-only"),
		});
		expect(block.send().disabled).toBe(true);
		expect(block.reaction(root.id, "+1").disabled).toBe(true);
	});
});
