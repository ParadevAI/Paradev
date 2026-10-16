import type { Editor } from "@tiptap/core";
import { stripeTestKit } from "./stripeTestKit";

/** The block test kit, plus what Slack's composer and messages need: the modules they reach for outside a window, and a hand on the editor. */
export async function slackTestKit() {
	const { mock } = await import("bun:test");
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
	const kit = await stripeTestKit();

	const editors = (root: ParentNode = document.body) =>
		[...root.querySelectorAll(".ProseMirror")].map(
			(dom) => (dom as HTMLElement & { editor: Editor }).editor,
		);
	const write = (editor: Editor, text: string) =>
		kit.act(async () => {
			editor.chain().clearContent().insertContent(text).run();
		});
	const option = (name: string | RegExp) =>
		kit.act(async () => {
			const found = [...document.body.querySelectorAll("[role=option]")].find(
				(each) =>
					typeof name === "string"
						? each.textContent?.trim() === name
						: name.test(each.textContent ?? ""),
			);
			if (!found) throw new Error(`No option ${name}`);
			kit.fireEvent.click(found);
		});
	const key = (label: string, name: string) =>
		kit.act(async () => {
			kit.fireEvent.keyDown(
				document.body.querySelector(`[aria-label="${label}"]`) as HTMLElement,
				{ key: name },
			);
		});
	const options = () =>
		[...document.body.querySelectorAll("[role=option]")].map(
			(each) => each.textContent?.trim() ?? "",
		);

	return { ...kit, editors, write, option, options, key };
}
