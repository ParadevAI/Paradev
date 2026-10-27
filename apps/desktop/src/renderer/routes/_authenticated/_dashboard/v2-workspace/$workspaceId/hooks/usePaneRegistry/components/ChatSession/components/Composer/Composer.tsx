import { Trans, useLingui } from "@lingui/react/macro";
import type {
	AvailableCommand,
	SessionConfigOption,
	SessionUsage,
	UserContent,
} from "@superset/chat/protocol";
import type {
	ComposerActionContext,
	ComposerChip,
	ComposerDraft,
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputHandle,
	PromptInputSubmitPayload,
} from "@superset/chat-ui/PromptInput";
import { formatRelativeTime } from "@superset/i18n/format";
import { usePaneFocus } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
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
	useState,
} from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { env } from "renderer/env.renderer";
import { useHotkey } from "renderer/hotkeys";
import { FileIcon, getFileIcon } from "renderer/lib/fileIcons";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";
import {
	type AgentSwitcher,
	ModelPicker,
} from "renderer/routes/_authenticated/components/AgentComposer/components/ModelPicker";
import {
	ModePicker,
	type SessionMode,
} from "renderer/routes/_authenticated/components/AgentComposer/components/ModePicker";
import { useFooterTier } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useFooterTier";
import { useGitHubMentionProviders } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useGitHubMentionProviders";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useChatComposerStore } from "../../../../stores/chatComposerStore";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";
import { useChatWiring } from "../../hooks/useSessionClient";
import type { ChatForkTarget } from "../../types";
import { chatContextLine, chatReferenceChip } from "../../utils/chatReference";
import { commandChip, LEADING_COMMAND } from "../../utils/commandChip";
import { mcpContextLine } from "../../utils/mcpServerChips";
import { elementsForChips } from "../../utils/messageElements";
import { AccountLimitNotice } from "./components/AccountLimitNotice";
import { ContextWindowRing } from "./components/ContextWindowRing";
import { useAppCommands } from "./hooks/useAppCommands";
import {
	prependToDraft,
	takeRecoveredDraft,
	useComposerDraft,
} from "./hooks/useComposerDraft";
import { useDrawerEntry } from "./hooks/useDrawerEntry";
import { useLinkChips } from "./hooks/useLinkChips";
import { useMcpServerPicker } from "./hooks/useMcpServerPicker";
import { useStatusDialog } from "./hooks/useStatusDialog";
import { useUploadAttachments } from "./hooks/useUploadAttachments";

export type ComposerTarget = {
	name: string;
	disabledReason?: string;
	onStop?: () => void;
};

export type ComposerHandle = Pick<
	PromptInputHandle,
	"restoreDraft" | "addFiles" | "focus"
> & {
	returnFocus: (recallHistory?: boolean) => void;
	/** Opens the model picker on this agent's models only. */
	openModelPicker: () => void;
};

export type ComposerProps = {
	workspaceId: string;
	/** This chat's own session, left out of the chats it can mention. */
	sessionId?: string;
	presetId?: string;
	draftKey: string;
	draftPersisted?: boolean;
	inputRef?: Ref<ComposerHandle>;
	availableCommands: AvailableCommand[];
	configOptions?: SessionConfigOption[];
	onSetConfigOption?: (configId: string, value: string) => unknown;
	onModelPickerOpenChange?: (open: boolean) => void;
	agentSwitcher?: AgentSwitcher;
	modes?: SessionMode[];
	currentModeId?: string;
	onSetMode?: (modeId: string) => void;
	// `draft` is what the composer held, for the host to hand back if the send fails.
	onSend: (
		content: UserContent[],
		options: { steer: boolean; draft: ComposerDraft },
	) => unknown;
	/** Opens the pane header's chat history picker, as `/resume` does. */
	onOpenHistory?: () => void;
	onNewChat?: () => void;
	onFork?: (target: ChatForkTarget) => void;
	canForkToWorktree?: boolean;
	onOpenFind?: () => void;
	history?: string[];
	isActive?: boolean;
	placeholder?: string;
	disabled?: boolean;
	onCancelTurn?: (() => void) | null;
	target?: ComposerTarget;
	escapeGoesBack?: boolean;
	onEnterDrawer?: (options: { actionableOnly: boolean }) => boolean;
	sessionUsage?: SessionUsage | null;
	turnRunning?: boolean;
	terminalId?: string;
	agentLabel?: string;
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
	agentLabel,
	agentSwitcher,
	availableCommands,
	canForkToWorktree,
	configOptions,
	escapeGoesBack = false,
	currentModeId,
	modes,
	onSetConfigOption,
	onModelPickerOpenChange,
	onSetMode,
	disabled,
	draftKey,
	draftPersisted = true,
	inputRef,
	history,
	isActive,
	onCancelTurn,
	onEnterDrawer,
	onFork,
	onNewChat,
	onOpenFind,
	onSend,
	onOpenHistory,
	placeholder,
	sessionUsage,
	target,
	turnRunning = false,
	terminalId,
	workspaceId,
	sessionId,
}: ComposerProps) {
	const { t } = useLingui();
	const blocked = disabled || target?.disabledReason !== undefined;
	const stop = target ? target.onStop : (onCancelTurn ?? undefined);
	const name = target?.name ?? "";
	const trpcUtils = workspaceTrpc.useUtils();
	const { hostUrl } = useWorkspaceClient();
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const githubProviders = useGitHubMentionProviders(
		useMemo(
			() =>
				workspace?.projectId && hostUrl
					? { projectId: workspace.projectId, hostUrl }
					: null,
			[workspace?.projectId, hostUrl],
		),
	);
	const uploadAttachments = useUploadAttachments(workspaceId);
	const { storedDraft, onDraftChange, clearDraft } = useComposerDraft(
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
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [agentModelsOnly, setAgentModelsOnly] = useState(false);
	const changeModelPickerOpen = useCallback(
		(open: boolean) => {
			setModelPickerOpen(open);
			if (!open) setAgentModelsOnly(false);
			onModelPickerOpenChange?.(open);
		},
		[onModelPickerOpenChange],
	);
	useImperativeHandle(
		inputRef,
		() => ({
			restoreDraft: (draft: ComposerDraft) =>
				promptInputRef.current?.restoreDraft(draft),
			addFiles: (files: File[]) => promptInputRef.current?.addFiles(files),
			focus: focusInput,
			returnFocus,
			openModelPicker: () => {
				setAgentModelsOnly(true);
				changeModelPickerOpen(true);
			},
		}),
		[focusInput, returnFocus, changeModelPickerOpen],
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
		const recovered = takeRecoveredDraft(draftKey);
		if (recovered) promptInputRef.current?.restoreDraft(recovered);
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
					icon: <FileIcon className="size-4" fileName={match.name} />,
					// The agent reads the path itself, so a mention is the path.
					select: (ctx) =>
						ctx.insertChip({
							label: match.name,
							serialized: match.relativePath,
							iconUrl: getFileIcon(match.name, false).src,
							data: { elementKind: "file_mention" },
						}),
				}),
			);
		},
		[trpcUtils, workspaceId],
	);

	const { transport } = useChatWiring();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const otherHostOf = useCallback(
		(chatWorkspaceId: string) => {
			const hostOf = (id: string) =>
				hostWorkspaces.find((workspace) => workspace.id === id)?.hostId;
			const chatHost = hostOf(chatWorkspaceId);
			return chatHost && chatHost !== hostOf(workspaceId) ? chatHost : null;
		},
		[hostWorkspaces, workspaceId],
	);
	const isDark = useIsDarkTheme();
	const searchChats = useCallback(
		async (query: string) => {
			const needle = query.trim().toLowerCase();
			// A host older than `query` ignores it; the filter below still applies.
			const sessions = await transport.listSessions({
				workspaceId,
				limit: 50,
				...(needle ? { query: needle } : {}),
			});
			return sessions
				.filter((session) => session.sessionId !== sessionId)
				.map((session) => ({
					session,
					title: session.title?.trim() || t({ message: "Untitled chat" }),
				}))
				.filter(({ title }) => !needle || title.toLowerCase().includes(needle))
				.sort((a, b) => b.session.updatedAt - a.session.updatedAt)
				.map(
					({ session, title }): ComposerMentionEntry => ({
						id: session.sessionId,
						label: title,
						description: formatRelativeTime(new Date(session.updatedAt)),
						select: (ctx) =>
							ctx.insertChip(
								chatReferenceChip(
									{ workspaceId, sessionId: session.sessionId, title },
									{ webUrl: env.NEXT_PUBLIC_WEB_URL, isDark },
								),
							),
					}),
				);
		},
		[transport, workspaceId, sessionId, isDark, t],
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
				id: "chats",
				title: t({ message: "Chats" }),
				priority: 3,
				source: {
					kind: "search",
					search: searchChats,
					emptyState: t({ message: "No other chats here" }),
				},
			},
			...githubProviders,
		],
		[githubProviders, searchFiles, searchChats, t],
	);

	const linkChips = useLinkChips();
	const statusDetails = useMemo(
		() =>
			terminalId
				? {
						workspaceId,
						terminalId,
						agentLabel,
						configOptions: configOptions ?? [],
						modes,
						currentModeId,
						usage: sessionUsage ?? null,
					}
				: undefined,
		[
			workspaceId,
			terminalId,
			agentLabel,
			configOptions,
			modes,
			currentModeId,
			sessionUsage,
		],
	);
	const status = useStatusDialog(statusDetails);
	const canCompact = availableCommands.some(
		(command) => command.name === "compact",
	);
	const compact = useCallback(
		() =>
			onSend([{ type: "text", text: "/compact" }], {
				steer: false,
				draft: {
					segments: [{ type: "text", text: "/compact" }],
					attachments: [],
				},
			}),
		[onSend],
	);
	const hasModelPicker =
		!target &&
		onSetConfigOption !== undefined &&
		(configOptions?.some(
			(option) => option.category === "model" && option.options.length > 0,
		) === true ||
			(agentSwitcher?.agents.length ?? 0) > 1);
	const openModelPicker = useCallback(
		() => changeModelPickerOpen(true),
		[changeModelPickerOpen],
	);
	const openMcp = useCallback(
		(ctx: ComposerActionContext) => mcpPicker.open.current(ctx),
		[mcpPicker.open],
	);
	const appCommands = useAppCommands({
		inputRef: promptInputRef,
		availableCommands,
		...(presetId ? { presetId } : {}),
		...(configOptions ? { configOptions } : {}),
		...(onSetConfigOption ? { onSetConfigOption } : {}),
		...(modes ? { modes } : {}),
		...(currentModeId ? { currentModeId } : {}),
		...(onSetMode ? { onSetMode } : {}),
		...(hasModelPicker ? { openModelPicker } : {}),
		...(onNewChat ? { onNewChat } : {}),
		...(onFork ? { onFork } : {}),
		...(canForkToWorktree ? { canForkToWorktree } : {}),
		...(onOpenHistory ? { onOpenHistory } : {}),
		...(onOpenFind ? { onOpenFind } : {}),
		...(status.available ? { openStatus: status.open } : {}),
		...(mcpPicker.available ? { openMcp } : {}),
		toSubagent: target !== undefined,
	});
	const { hiddenAgentNames, runTyped } = appCommands;
	const commands = useMemo(
		() => [
			...appCommands.commands,
			...toMenuCommands(
				availableCommands.filter(
					(command) =>
						!hiddenAgentNames.has(command.name) &&
						!HIDDEN_AGENT_COMMANDS.has(command.name),
				),
				{
					commands: t({ message: "Commands" }),
					mcp: t({ message: "MCP Server Commands" }),
				},
			),
		],
		[appCommands.commands, availableCommands, hiddenAgentNames, t],
	);

	const send = useCallback(
		async (
			text: string,
			files: File[],
			mentions: ComposerChip[],
			steer: boolean,
			draft: ComposerDraft,
		) => {
			const tags = await uploadAttachments(files);
			if (!tags) {
				const input = promptInputRef.current;
				if (input) input.restoreDraft(draft);
				else prependToDraft(draftKey, [draft]);
				return;
			}
			const message = text.trim();
			const elements = elementsForChips(message, mentions);
			const mcpContext = mcpContextLine(
				mentions.flatMap((chip) => mcpPicker.serverNameOf(chip) ?? []),
			);
			const chatContext = chatContextLine(
				mentions,
				env.NEXT_PUBLIC_WEB_URL,
				otherHostOf,
			);
			onSend(
				[
					{
						type: "text",
						text: [message, ...tags].filter(Boolean).join("\n"),
						...(elements.length > 0 ? { elements } : {}),
					},
					...[mcpContext, chatContext].flatMap((context) =>
						context
							? [{ type: "text" as const, text: context, hidden: true }]
							: [],
					),
				],
				{ steer, draft },
			);
			clearDraft();
		},
		[
			onSend,
			uploadAttachments,
			clearDraft,
			draftKey,
			mcpPicker.serverNameOf,
			otherHostOf,
		],
	);

	const handleSubmit = useCallback(
		({ text, files, mentions, steer, draft }: PromptInputSubmitPayload) => {
			if (blocked || (text.trim() === "" && files.length === 0)) return false;
			const typed = runTyped(text, files.length > 0);
			if (typed === "ran") return;
			if (typed === "kept") return false;
			const name = LEADING_COMMAND.exec(text.trim())?.[1];
			if (
				name &&
				!target &&
				availableCommands.length > 0 &&
				!availableCommands.some((command) => command.name === name)
			) {
				toast.error(t({ message: `Unknown command /${name}` }));
				return false;
			}
			return send(text, files, mentions, steer, draft);
		},
		[availableCommands, blocked, runTyped, send, t, target],
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
			{terminalId && (
				<AccountLimitNotice
					className={CHAT_COLUMN_CLASSNAME}
					terminalId={terminalId}
					workspaceId={workspaceId}
				/>
			)}
			<AgentComposer
				className={CHAT_COLUMN_CLASSNAME}
				commands={commands}
				draft={storedDraft}
				chipForPaste={linkChips.chipForPaste}
				renderChip={linkChips.renderChip}
				history={history}
				key={draftKey}
				mentionProviders={mentionProviders}
				onDraftChange={onDraftChange}
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
					target ? undefined : (
						<>
							{sessionUsage && (
								<ContextWindowRing
									usage={sessionUsage}
									onCompact={canCompact ? compact : undefined}
									compactDisabled={blocked || turnRunning}
								/>
							)}
							{configOptions && onSetConfigOption && (
								<ModelPicker
									agentSwitcher={agentModelsOnly ? undefined : agentSwitcher}
									configOptions={configOptions}
									hideEffortLabel={footerTier >= 1}
									hideModelLabel={footerTier >= 3}
									onOpenChange={changeModelPickerOpen}
									onSelect={onSetConfigOption}
									open={modelPickerOpen}
								/>
							)}
						</>
					)
				}
			/>
			{mcpPicker.dialog}
			{status.dialog}
		</div>
	);
});
