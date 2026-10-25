import { Trans, useLingui } from "@lingui/react/macro";
import { appendPastedText } from "@superset/chat/core";
import type {
	AvailableCommand,
	SessionConfigOption,
	UserContent,
} from "@superset/chat/protocol";
import type {
	ComposerChip,
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputHandle,
	PromptInputSubmitPayload,
} from "@superset/chat-ui/PromptInput";
import { usePaneFocus } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { History } from "lucide-react";
import {
	memo,
	type Ref,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { env } from "renderer/env.renderer";
import { useHotkey } from "renderer/hotkeys";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";
import { useChatComposerStore } from "../../../../stores/chatComposerStore";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";
import { commandChip, LEADING_COMMAND } from "../../utils/commandChip";
import { mcpContextLine } from "../../utils/mcpServerChips";
import { elementsForChips } from "../../utils/messageElements";
import { type AgentSwitcher, ModelPicker } from "./components/ModelPicker";
import { ModePicker, type SessionMode } from "./components/ModePicker";
import { useAttachmentPreview } from "./hooks/useAttachmentPreview";
import {
	takeRecoveredDraftText,
	useComposerDraft,
} from "./hooks/useComposerDraft";
import { useDrawerEntry } from "./hooks/useDrawerEntry";
import { useFooterTier } from "./hooks/useFooterTier";
import { useMcpServerPicker } from "./hooks/useMcpServerPicker";
import { useUploadAttachments } from "./hooks/useUploadAttachments";

export type ComposerTarget = {
	name: string;
	disabledReason?: string;
	onStop?: () => void;
};

export type ComposerHandle = Pick<
	PromptInputHandle,
	"appendText" | "addFiles" | "focus"
> & {
	returnFocus: (recallHistory?: boolean) => void;
};

export type ComposerProps = {
	workspaceId: string;
	presetId?: string;
	draftKey: string;
	draftPersisted?: boolean;
	inputRef?: Ref<ComposerHandle>;
	availableCommands: AvailableCommand[];
	configOptions?: SessionConfigOption[];
	onSetConfigOption?: (configId: string, value: string) => unknown;
	agentSwitcher?: AgentSwitcher;
	modes?: SessionMode[];
	currentModeId?: string;
	onSetMode?: (modeId: string) => void;
	onSend: (content: UserContent[], options: { steer: boolean }) => unknown;
	/** Opens the pane header's chat history picker, as `/resume` does. */
	onOpenHistory?: () => void;
	history?: string[];
	isActive?: boolean;
	placeholder?: string;
	disabled?: boolean;
	onCancelTurn?: (() => void) | null;
	target?: ComposerTarget;
	canQueue?: boolean;
	escapeGoesBack?: boolean;
	onEnterDrawer?: (options: { actionableOnly: boolean }) => boolean;
};

const HIDDEN_AGENT_COMMANDS = new Set(["rewind"]);

/**
 * The agent's own slash commands, in the shape the composer's menu takes.
 * Selecting one inserts a chip that serializes back to `/name`, so what the
 * agent receives is the command it advertised.
 */
function toMenuCommands(
	commands: AvailableCommand[],
	groups: { commands: string; mcp: string },
): PromptInputCommand[] {
	return commands.map((command) => ({
		id: command.name,
		title: `/${command.name}`,
		...(command.hint ? { hint: command.hint } : {}),
		description: command.description ?? "",
		group: command.category === "mcp" ? groups.mcp : groups.commands,
		onSelect: (ctx) => {
			ctx.insertChip(commandChip(command.name, command.description));
		},
	}));
}

const FOCUS_HANDOFF_MS = 1000;
let focusHandoff: { draftKey: string; at: number } | null = null;

export const Composer = memo(function Composer({
	presetId,
	agentSwitcher,
	availableCommands,
	canQueue = false,
	configOptions,
	escapeGoesBack = false,
	currentModeId,
	modes,
	onSetConfigOption,
	onSetMode,
	disabled,
	draftKey,
	draftPersisted = true,
	inputRef,
	history,
	isActive,
	onCancelTurn,
	onEnterDrawer,
	onSend,
	onOpenHistory,
	placeholder,
	target,
	workspaceId,
}: ComposerProps) {
	const { t } = useLingui();
	const blocked = disabled || target?.disabledReason !== undefined;
	const stop = target ? target.onStop : (onCancelTurn ?? undefined);
	const queueing = !target && canQueue;
	const name = target?.name ?? "";
	const trpcUtils = workspaceTrpc.useUtils();
	const cloudUtils = cloudTrpc.useUtils();
	const uploadAttachments = useUploadAttachments(workspaceId);
	const attachmentPreview = useAttachmentPreview();
	const { storedDraft, onChange, clearDraft } = useComposerDraft(
		draftKey,
		draftPersisted,
	);
	const promptInputRef = useRef<PromptInputHandle>(null);
	const focusInput = useCallback(() => promptInputRef.current?.focus(), []);
	const recallHistory = useCallback(
		() => promptInputRef.current?.recallPreviousPrompt(),
		[],
	);
	const drawerEntry = useDrawerEntry({
		enterDrawer: onEnterDrawer,
		focusComposer: focusInput,
		recallHistory,
	});
	const { returnFocus } = drawerEntry;
	const mcpPicker = useMcpServerPicker({ workspaceId, presetId });
	useImperativeHandle(
		inputRef,
		() => ({
			appendText: (text: string) => promptInputRef.current?.appendText(text),
			addFiles: (files: File[]) => promptInputRef.current?.addFiles(files),
			focus: focusInput,
			returnFocus,
		}),
		[focusInput, returnFocus],
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const footerTier = useFooterTier(rootRef);
	const composerId = useId();
	useEffect(() => {
		const { register, unregister } = useChatComposerStore.getState();
		register(composerId, workspaceId, {
			addFiles: (files) => promptInputRef.current?.addFiles(files),
		});
		return () => unregister(composerId);
	}, [composerId, workspaceId]);
	useEffect(() => {
		const recovered = takeRecoveredDraftText(draftKey);
		if (recovered) promptInputRef.current?.appendText(recovered);
	}, [draftKey]);
	useLayoutEffect(() => {
		const handoff = focusHandoff;
		if (handoff?.draftKey === draftKey) {
			focusHandoff = null;
			const focusIsFree =
				!document.activeElement || document.activeElement === document.body;
			if (focusIsFree && Date.now() - handoff.at < FOCUS_HANDOFF_MS) {
				promptInputRef.current?.focus();
			}
		}
		const root = rootRef.current;
		return () => {
			if (root?.contains(document.activeElement)) {
				focusHandoff = { draftKey, at: Date.now() };
			}
		};
	}, [draftKey]);
	usePaneFocus(focusInput);
	useHotkey("FOCUS_CHAT_INPUT", () => promptInputRef.current?.focus(), {
		enabled: Boolean(isActive),
	});
	useHotkey(
		"CHAT_ADD_ATTACHMENT",
		() => promptInputRef.current?.openFileDialog(),
		{ enabled: Boolean(isActive) },
	);
	useEffect(() => {
		if (!isActive) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.defaultPrevented) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.isComposing || event.getModifierState("AltGraph")) return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest("input, textarea, select, [contenteditable]"))
			)
				return;
			event.preventDefault();
			promptInputRef.current?.focus();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isActive]);
	const searchFiles = useCallback(
		async (query: string) => {
			if (!query) return [];
			const { matches } = await trpcUtils.filesystem.searchFiles.fetch({
				workspaceId,
				query,
				includeHidden: false,
				limit: 20,
			});
			return matches.map(
				(match): ComposerMentionEntry => ({
					id: match.absolutePath,
					label: match.name,
					description: match.relativePath,
					// The agent reads the path itself, so a mention is the path.
					select: (ctx) =>
						ctx.insertChip({
							label: match.name,
							serialized: match.relativePath,
							data: { elementKind: "file_mention" },
						}),
				}),
			);
		},
		[trpcUtils, workspaceId],
	);

	const searchPages = useCallback(
		async (query: string) => {
			const { items } = await cloudUtils.page.listPaginated.fetch(
				pagesListInput({ search: query || undefined, limit: 20 }),
			);
			return items.map((page): ComposerMentionEntry => {
				const url = new URL(
					`/page/${encodeURIComponent(page.slug)}`,
					env.NEXT_PUBLIC_WEB_URL,
				).toString();
				return {
					id: page.id,
					label: page.title,
					description: page.slug,
					select: (ctx) =>
						ctx.insertChip({ label: page.title, serialized: url }),
				};
			});
		},
		[cloudUtils],
	);

	const mentionProviders = useMemo<ComposerMentionProvider[]>(
		() => [
			{
				id: "files",
				title: t({ message: "Files" }),
				priority: 1,
				source: {
					kind: "search",
					search: searchFiles,
					emptyState: t({ message: "Type to search files..." }),
				},
			},
			{
				id: "pages",
				title: t({ message: "Pages" }),
				priority: 2,
				source: {
					kind: "search",
					search: searchPages,
					emptyState: t({ message: "No pages yet" }),
				},
			},
		],
		[searchFiles, searchPages, t],
	);

	const mcpCommand = mcpPicker.command;
	const resumeCommand = useMemo<PromptInputCommand | null>(
		() =>
			onOpenHistory
				? {
						id: "superset:resume",
						title: "/resume",
						description: t({ message: "Chat history" }),
						icon: <History className="size-4" />,
						group: t({ message: "Commands" }),
						onSelect: () => {
							queueMicrotask(() => {
								promptInputRef.current?.blur();
								onOpenHistory();
							});
						},
					}
				: null,
		[onOpenHistory, t],
	);
	const commands = useMemo(() => {
		const local: PromptInputCommand[] = [
			...(mcpCommand ? [mcpCommand] : []),
			...(resumeCommand ? [resumeCommand] : []),
		];
		const agentCommands = toMenuCommands(
			availableCommands.filter(
				(command) =>
					!(mcpCommand && command.name === "mcp") &&
					!(resumeCommand && command.name === "resume") &&
					!HIDDEN_AGENT_COMMANDS.has(command.name),
			),
			{
				commands: t({ message: "Commands" }),
				mcp: t({ message: "MCP Server Commands" }),
			},
		);
		return [...local, ...agentCommands];
	}, [availableCommands, mcpCommand, resumeCommand, t]);

	const send = useCallback(
		async (
			text: string,
			files: File[],
			mentions: ComposerChip[],
			pastedTexts: string[],
			steer: boolean,
		) => {
			const tags = await uploadAttachments(files);
			if (!tags) {
				promptInputRef.current?.appendText(appendPastedText(text, pastedTexts));
				return;
			}
			const message = text.trim();
			const elements = elementsForChips(message, mentions);
			const mcpContext = mcpContextLine(
				mentions.flatMap((chip) => mcpPicker.serverNameOf(chip) ?? []),
			);
			onSend(
				[
					{
						type: "text",
						text: appendPastedText(
							[message, ...tags].filter(Boolean).join("\n"),
							pastedTexts,
						),
						...(elements.length > 0 ? { elements } : {}),
					},
					...(mcpContext
						? [{ type: "text" as const, text: mcpContext, hidden: true }]
						: []),
				],
				{ steer },
			);
			clearDraft();
		},
		[onSend, uploadAttachments, clearDraft, mcpPicker.serverNameOf],
	);

	const handleSubmit = useCallback(
		({
			text,
			files,
			mentions,
			pastedTexts,
			steer,
		}: PromptInputSubmitPayload) => {
			if (
				blocked ||
				(text.trim() === "" && files.length === 0 && pastedTexts.length === 0)
			)
				return;
			const name = LEADING_COMMAND.exec(text.trim())?.[1];
			const input = promptInputRef.current;
			if (text.trim() === "/mcp" && mcpPicker.command && input) {
				queueMicrotask(() =>
					mcpPicker.open.current({
						insertChip: input.insertChip,
						attachFiles: input.openFileDialog,
						openPanel: input.openPanel,
						query: "",
					}),
				);
				return;
			}
			if (
				text.trim() === "/resume" &&
				onOpenHistory &&
				files.length === 0 &&
				pastedTexts.length === 0
			) {
				queueMicrotask(() => {
					input?.blur();
					onOpenHistory();
				});
				return;
			}
			if (
				name &&
				!target &&
				availableCommands.length > 0 &&
				!availableCommands.some((command) => command.name === name)
			) {
				toast.error(t({ message: `Unknown command /${name}` }));
				return false;
			}
			return send(text, files, mentions, pastedTexts, steer);
		},
		[availableCommands, blocked, send, t, target, mcpPicker, onOpenHistory],
	);

	return (
		<div
			ref={rootRef}
			className={cn(CHAT_GUTTER_CLASSNAME, "pt-1 pb-5")}
			onKeyDownCapture={drawerEntry.onKeyDownCapture}
			onFocusCapture={() =>
				useChatComposerStore.getState().markActive(composerId)
			}
		>
			<AgentComposer
				className={CHAT_COLUMN_CLASSNAME}
				clearOnSubmit={!blocked}
				collapseLargePastes
				commands={commands}
				defaultValue={storedDraft}
				findChips={mcpPicker.findChips}
				history={history}
				key={draftKey}
				mentionProviders={mentionProviders}
				onAttachmentClick={attachmentPreview.onAttachmentClick}
				onChange={onChange}
				onStop={stop}
				onSubmit={handleSubmit}
				ref={promptInputRef}
				placeholder={
					target
						? (target.disabledReason ?? t({ message: `Message ${name}…` }))
						: (placeholder ??
							t({ message: "Ask the agent, @mention files, run /commands" }))
				}
				status={stop ? "streaming" : "ready"}
				stopOnEscape={!escapeGoesBack}
				submitWhileStreaming={target !== undefined || queueing}
				toolbar={
					target ? (
						<span className="flex h-6 min-w-0 max-w-48 items-center rounded-md border border-border/60 px-2 font-sans text-foreground/70 text-xs">
							<span className="min-w-0 truncate">
								<Trans>to {name}</Trans>
							</span>
						</span>
					) : modes && onSetMode ? (
						<ModePicker
							currentModeId={currentModeId}
							iconOnly={footerTier >= 2}
							modes={modes}
							onSelect={onSetMode}
						/>
					) : undefined
				}
				toolbarEnd={
					!target && configOptions && onSetConfigOption ? (
						<ModelPicker
							agentSwitcher={agentSwitcher}
							configOptions={configOptions}
							hideEffortLabel={footerTier >= 1}
							hideModelLabel={footerTier >= 3}
							onSelect={onSetConfigOption}
						/>
					) : undefined
				}
			/>
			{attachmentPreview.overlay}
			{mcpPicker.dialog}
		</div>
	);
});
