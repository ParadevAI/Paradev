import { describe, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { stripeTestKit } from "./components/stripeTestKit";

mock.module("renderer/lib/clickPolicy", () => ({
	useUrlLinkAction: () => () => null,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		external: { openUrl: { useMutation: () => ({ mutate: () => {} }) } },
	},
}));
const { act, fireEvent, render, TooltipProvider } = await stripeTestKit();
// The tab store reaches this library with require(); it must be loaded before that.
await import("react-dnd");
const gmail = await import("./components/GmailEmailBlock/fixtures");
const slack = await import("./components/SlackThreadBlock/fixtures");
const { CardBlock } = await import("./CardBlock");

type Props = ComponentProps<typeof CardBlock>;
type Resolved = Props["block"]["resolved"];

function mount(type: string, resolved: Partial<Resolved>) {
	const calls: unknown[][] = [];
	const view = render(
		<TooltipProvider>
			<CardBlock
				block={{
					id: "c1",
					type: "card",
					actionable: true,
					card: { type, refs: {} },
					resolved: {
						type,
						brand: null,
						state: "ok",
						title: "",
						fields: [],
						actions: [],
						...resolved,
					},
				}}
				done={false}
				pending={false}
				failure={null}
				onAct={(...args) => calls.push(args)}
				onConnect={() => {}}
				focused
			/>
		</TooltipProvider>,
	);
	const header = view.container.querySelector(
		".border-b.border-border",
	) as HTMLElement;
	const body = () => {
		const copy = view.container.cloneNode(true) as HTMLElement;
		copy.querySelector(".border-b.border-border")?.remove();
		return copy.textContent ?? "";
	};
	return { ...view, calls, header, body };
}

describe("a card's header row holds its secondary and no actions", () => {
	test("Gmail: the account, then archive, This is nothing and Open in Gmail, each answering its key", async () => {
		const { calls, header, body } = mount("gmail.email", {
			brand: "gmail",
			view: gmail.threadView(
				[gmail.message({ id: "m1", text: "Who is bringing the projector?" })],
				{},
				"I will.",
			),
			actions: gmail.actions,
		});
		expect(header.textContent).toContain(gmail.me.email);
		expect(header.textContent).toContain("This is nothing");
		expect(header.textContent).toContain("Open in Gmail");
		expect(body()).not.toContain("This is nothing");
		const archive = header.querySelector(
			'[aria-label="Archive"]',
		) as HTMLElement;
		expect(archive.querySelector("kbd")).not.toBeNull();
		await act(async () => {
			fireEvent.click(archive);
		});
		await act(async () => {
			fireEvent.click(
				header.querySelector('[data-action-key="dismiss"]') as HTMLElement,
			);
		});
		expect(calls.map((call) => call[0])).toEqual(["archive", "nothing"]);
	});

	test("Slack thread: the channel, then Leave it and Open in Slack", async () => {
		const { calls, header, body } = mount("slack.thread", {
			brand: "slack",
			view: slack.thread(),
			actions: slack.actions,
		});
		expect(header.textContent).toContain(slack.thread().channel.name);
		expect(header.textContent).toContain("Open in Slack");
		expect(body()).not.toContain("Leave it");
		const leave = header.querySelector(
			'[data-action-key="dismiss"]',
		) as HTMLElement;
		expect(leave.textContent).toContain("Leave it");
		await act(async () => {
			fireEvent.click(leave);
		});
		expect(calls.map((call) => call[0])).toEqual(["leave"]);
	});

	test("a card with nothing to put there keeps an empty slot", () => {
		const { header } = mount("posthog.feature_flag", {
			brand: "posthog",
			title: "Flag",
			actions: [
				{ id: "enable", label: "Turn on", style: "primary", role: "primary" },
			],
		});
		expect(header.lastElementChild?.childElementCount).toBe(0);
	});
});
