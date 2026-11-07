import { afterEach, expect, test } from "bun:test";
import {
	type ComposerMentionProvider,
	PromptInput,
	type PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import type { AppRouter } from "@superset/host-service/trpc";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { linkedPrChip } from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import { ChatPaneActionsProvider } from "../../../../providers/ChatPaneActionsProvider";
import { useLinkChips } from "./useLinkChips";

const noAnswers: TRPCLink<AppRouter> = () => () =>
	observable((observer) => observer.complete());

afterEach(cleanup);

const handle: { current: PromptInputHandle | null } = { current: null };

const mentionProviders: ComposerMentionProvider[] = [
	{
		id: "files",
		title: "Files",
		priority: 0,
		source: { kind: "static", load: () => [] },
	},
];

function Composer() {
	const { chipForPaste, renderChip } = useLinkChips();
	return (
		<PromptInput
			chipForPaste={chipForPaste}
			commands={[]}
			draft={{
				segments: [
					{
						type: "text",
						text: "Draft about https://github.com/acme/widgets/issues/7 here",
					},
				],
				attachments: [],
			}}
			mentionProviders={mentionProviders}
			ref={(instance) => {
				handle.current = instance;
			}}
			renderChip={renderChip}
		/>
	);
}

async function setup() {
	const view = render(
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [noAnswers] })}
			queryClient={new QueryClient()}
		>
			<ChatPaneActionsProvider workspaceId="workspace-1">
				<Composer />
			</ChatPaneActionsProvider>
		</workspaceTrpc.Provider>,
	);
	const editable = view.container.querySelector(
		"[contenteditable]",
	) as HTMLElement;
	const paste = async (value: string) => {
		const data = new DataTransfer();
		data.setData("text/plain", value);
		const event = new ClipboardEvent("paste", {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		});
		await act(async () => {
			editable.focus();
			editable.dispatchEvent(event);
		});
	};
	const chips = () =>
		[...view.container.querySelectorAll("[data-mention-chip]")].map(
			(chip) => chip.textContent,
		);
	const text = () => view.container.textContent ?? "";
	const type = async (value: string) => {
		await act(async () => {
			handle.current?.restoreDraft({
				segments: [{ type: "text", text: value }],
				attachments: [],
			});
		});
	};
	const chipHasPopup = () => {
		const chip = view.container.querySelector("[data-mention-chip]");
		return (
			chip?.hasAttribute("data-state") ||
			chip?.closest("[data-slot=hover-card-trigger]") !== null
		);
	};
	const pasteAsText = async (value: string) => {
		await act(async () => {
			editable.focus();
			editable.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "V",
					ctrlKey: true,
					shiftKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);
		});
		await paste(value);
	};
	const chipHasHoverCard = () =>
		view.container
			.querySelector("[data-mention-chip]")
			?.closest("[data-slot=hover-card-trigger]") != null;
	return {
		paste,
		pasteAsText,
		chips,
		text,
		type,
		chipHasPopup,
		chipHasHoverCard,
	};
}

test("a pasted link becomes a named chip; other text stays text", async () => {
	const { paste, chips } = await setup();
	await paste("https://github.com/acme/widgets/pull/42");
	expect(chips()).toContain("acme/widgets#42");
	const before = chips().length;
	await paste("a sentence with no link");
	expect(chips()).toHaveLength(before);
});

test("a typed or restored link stays text", async () => {
	const { chips, text } = await setup();
	expect(chips()).toEqual([]);
	expect(text()).not.toContain("biome-ignore");
	expect(text()).not.toContain("drag-and-drop");
});

test("while the mention menu is open, a chip has no card or tooltip to cover it", async () => {
	const { paste, type, chipHasPopup } = await setup();
	await paste("https://agentclientprotocol.com/protocol/content");
	expect(chipHasPopup()).toBe(true);
	await type(" @");
	expect(chipHasPopup()).toBe(false);
});

test("Ctrl+Shift+V pastes a link as text, and the next paste is a chip again", async () => {
	const { paste, pasteAsText, chips, text } = await setup();
	await pasteAsText("https://github.com/acme/widgets/pull/42");
	expect(chips()).toEqual([]);
	expect(text()).toContain("https://github.com/acme/widgets/pull/42");
	await paste("https://github.com/acme/widgets/pull/43");
	expect(chips()).toEqual(["acme/widgets#43"]);
});

test("a pull request picked from the @ menu gets the hover card it has once sent", async () => {
	const { chipHasHoverCard } = await setup();
	await act(async () => {
		handle.current?.restoreDraft({
			segments: [
				{
					type: "chip",
					chip: linkedPrChip({
						prNumber: 42,
						title: "Fix login",
						url: "https://github.com/acme/widgets/pull/42",
						state: "open",
					}),
				},
			],
			attachments: [],
		});
	});
	expect(chipHasHoverCard()).toBe(true);
});
