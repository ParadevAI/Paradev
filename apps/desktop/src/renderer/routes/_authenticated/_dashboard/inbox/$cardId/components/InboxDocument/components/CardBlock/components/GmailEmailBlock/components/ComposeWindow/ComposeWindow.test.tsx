import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, test } = await import(
	"bun:test"
);
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
const uploads: string[] = [];
mock.module("../../utils/uploadAttachment", () => ({
	uploadAttachment: async (file: File) => {
		uploads.push(file.name);
		return "8b7e1d2c-0000-4000-8000-000000000001";
	},
}));
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TooltipProvider } = await import("@superset/ui/tooltip");
const { composeView, sendAs } = await import("../../fixtures");
const { ComposeWindow } = await import("./ComposeWindow");
const { scheduleSuggestions } = await import("../ScheduleSendDialog");
const { withSignature } = await import("../../hooks/useGmailCompose");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const blockedDraft = {
	...composeView.draft,
	attachments: [
		{
			partId: "2",
			filename: "manual.pdf",
			mimeType: "application/pdf",
			size: 1200,
			url: "https://example.com/manual.pdf",
			blocked: false,
		},
		{
			partId: "3",
			filename: "setup.exe",
			mimeType: "application/x-msdownload",
			size: 1200,
			url: "https://example.com/setup.exe",
			blocked: true,
		},
	],
};

type Props = Parameters<typeof ComposeWindow>[0];

function mount(
	overrides: Partial<
		Pick<Props, "draft" | "sendAs" | "onSchedule" | "failure">
	> = {},
) {
	const props = {
		draft: composeView.draft,
		sendAs,
		known: [],
		gmailUrl: "https://mail.google.com/",
		pending: false,
		failure: null,
		onSend: mock(),
		onSaveDraft: mock(),
		onSchedule: mock() as Props["onSchedule"],
		onRemoveBlockedAndSend: mock(),
		onDiscard: mock(),
		...overrides,
	};
	const view = render(
		<TooltipProvider>
			<ComposeWindow {...props} />
		</TooltipProvider>,
	);
	const button = (label: string) =>
		[...view.container.querySelectorAll("button")].find(
			(b) =>
				b.textContent?.trim() === label ||
				b.getAttribute("aria-label") === label,
		) as HTMLButtonElement;
	return { ...view, props, button };
}

describe("Gmail's compose window", () => {
	test("the header says New Message instead of repeating the subject", () => {
		const { container } = mount();
		expect(container.textContent).toContain("New Message");
		expect(container.textContent?.split(composeView.draft.subject).length).toBe(
			1,
		);
	});

	test("Send goes out with the edited fields and the From address", async () => {
		const { button, props } = mount();
		await act(async () => fireEvent.click(button("Send")));
		expect(props.onSend).toHaveBeenCalledTimes(1);
		expect(props.onSend.mock.calls[0]?.[0]).toMatchObject({
			to: ["Avery Chen <avery@lumenlabs.io>"],
			subject: composeView.draft.subject,
			from: "satya@superset.sh",
		});
	});

	test("a blocked file keeps Send off and offers to drop it and send", async () => {
		const { button, props, container } = mount({ draft: blockedDraft });
		expect(button("Send").disabled).toBe(true);
		expect(container.textContent).toContain("Blocked for security reasons");
		await act(async () =>
			fireEvent.click(button("Remove blocked files and send")),
		);
		expect(props.onRemoveBlockedAndSend.mock.calls[0]?.[0]).toMatchObject({
			keep: ["2"],
			uploads: [],
		});
	});

	test("with no Gmail draft behind it, Send carries the files and schedule is gone", async () => {
		const { button, props } = mount({
			draft: {
				...blockedDraft,
				attachments: blockedDraft.attachments.slice(0, 1),
			},
			onSchedule: undefined,
		});
		expect(button("More send options")).toBeUndefined();
		await act(async () => fireEvent.click(button("Send")));
		expect(props.onSend.mock.calls[0]?.[0]).toMatchObject({
			keep: ["2"],
			uploads: [],
		});
	});

	test("markdown typed at a line start stays text, and a typed address stays plain, as in Gmail", async () => {
		const { container } = mount();
		const dom = container.querySelector(".ProseMirror") as HTMLElement & {
			editor: import("@tiptap/core").Editor;
		};
		const { view } = dom.editor;
		const type = (text: string) => {
			for (const ch of text) {
				const { from, to } = view.state.selection;
				const handled = view.someProp("handleTextInput", (f) =>
					f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
				);
				if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
			}
		};
		await act(async () => {
			dom.editor.commands.setContent("<p></p>");
			type("- a");
		});
		expect(dom.editor.getHTML().replace(/ class="[^"]*"/g, "")).toBe(
			"<p>- a</p>",
		);
		await act(async () => {
			dom.editor.commands.setContent("<p></p>");
			type("1. a");
		});
		expect(dom.editor.getHTML().replace(/ class="[^"]*"/g, "")).toBe(
			"<p>1. a</p>",
		);
		await act(async () => {
			dom.editor.commands.setContent("<p></p>");
			type("see example.com ok");
		});
		expect(dom.editor.getHTML().replace(/ class="[^"]*"/g, "")).toBe(
			"<p>see example.com ok</p>",
		);
	});

	test("a file over Gmail's 25 MB is refused on attach, with nothing uploaded", async () => {
		const { container } = mount();
		const big = new File(["x"], "video.mov");
		Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
		const input = container.querySelector(
			"input[type=file]",
		) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(input, { target: { files: [big] } });
		});
		expect(container.textContent).toContain("Over Gmail's 25 MB limit");
		expect(uploads).not.toContain("video.mov");
	});

	test("a file the server refuses shows the reason on its chip, and Send is free again", async () => {
		const view = mount();
		const input = view.container.querySelector(
			"input[type=file]",
		) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(input, {
				target: { files: [new File(["MZ"], "setup.exe")] },
			});
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
		expect(view.button("Send").disabled).toBe(true);
		view.rerender(
			<TooltipProvider>
				<ComposeWindow
					{...view.props}
					failure="setup.exe was blocked for security reasons"
				/>
			</TooltipProvider>,
		);
		expect(view.container.textContent).toContain(
			"setup.exe was blocked for security reasons",
		);
		expect(view.button("Send").disabled).toBe(false);
	});

	test("a plain-text draft opens line by line, markup left as typed, and goes out as Gmail's lines", async () => {
		const { container, button, props } = mount({
			draft: {
				...composeView.draft,
				body: "Hi Avery,\n\nUse *bold*\n- one",
				html: null,
			},
		});
		const dom = container.querySelector(".ProseMirror") as HTMLElement;
		expect([...dom.children].map((p) => p.textContent).slice(0, 4)).toEqual([
			"Hi Avery,",
			"",
			"Use *bold*",
			"- one",
		]);
		await act(async () => fireEvent.click(button("Send")));
		expect(props.onSend.mock.calls[0]?.[0].html).toStartWith(
			"<div>Hi Avery,</div><div><br></div><div>Use *bold*</div><div>- one</div>",
		);
	});

	test("removing a file saves the draft without it", async () => {
		const { button, props } = mount({ draft: blockedDraft });
		await act(async () => fireEvent.click(button("Remove manual.pdf")));
		expect(props.onSaveDraft.mock.calls.at(-1)?.[0]).toMatchObject({
			keep: ["3"],
		});
	});

	test("From appears only when there is more than one address to send as", () => {
		expect(mount().container.querySelector("select")).toBeNull();
		cleanup();
		const { container } = mount({
			sendAs: [
				...sendAs,
				{
					email: "hello@superset.sh",
					name: "Superset",
					isDefault: false,
					signature: "",
				},
			],
		});
		expect(container.querySelector("select")?.textContent).toContain(
			"hello@superset.sh",
		);
	});

	test("the formatting bar opens from Aa with Gmail's controls", async () => {
		const { button, container } = mount();
		await act(async () => fireEvent.click(button("Formatting options")));
		const labels = [
			...container.querySelectorAll('[role="toolbar"] button'),
		].map((b) => b.getAttribute("aria-label"));
		expect(labels).toEqual([
			"Undo",
			"Redo",
			"Size",
			"Bold",
			"Italic",
			"Underline",
			"Text color",
			"Numbered list",
			"Bulleted list",
			"Indent less",
			"Indent more",
			"Quote",
			"Strikethrough",
			"Remove formatting",
		]);
	});
});

describe("signature and schedule", () => {
	test("the signature goes under the body once", () => {
		const signed = withSignature("<p>Hi</p>", "<div>Satya<br>Superset</div>");
		expect(signed).toBe("<p>Hi</p><p></p><p>-- <br>Satya<br>Superset</p>");
		expect(withSignature(signed, "<div>Satya<br>Superset</div>")).toBe(signed);
		expect(withSignature("<p>Hi</p>", "")).toBe("<p>Hi</p>");
	});

	test("Gmail's suggestions: tomorrow 8 AM and 1 PM, next Monday 8 AM", () => {
		const thursday = new Date(2026, 9, 1, 15, 0);
		const [morning, afternoon, monday] = scheduleSuggestions(thursday);
		expect(morning?.when.getDate()).toBe(2);
		expect(morning?.when.getHours()).toBe(8);
		expect(afternoon?.when.getHours()).toBe(13);
		expect(monday?.when.getDay()).toBe(1);
		expect(monday?.when.getDate()).toBe(5);
	});
});
