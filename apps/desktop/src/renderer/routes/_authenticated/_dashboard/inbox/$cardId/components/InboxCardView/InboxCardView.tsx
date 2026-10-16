import { Trans, useLingui } from "@lingui/react/macro";
import { usePageCommentThreads } from "@superset/cloud-client";
import { errorMessage } from "@superset/i18n/errors";
import { formatRelativeTime } from "@superset/i18n/format";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { Button } from "@superset/ui/button";
import { CommentModeButton } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Archive, Check } from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { LuInbox, LuTerminal } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { PageViewer } from "renderer/routes/_authenticated/_dashboard/components/PageViewer";
import { useInboxOutcomeLabel } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxOutcomeLabel";
import { useInboxSelection } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxSelection";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useInboxPanelStore } from "renderer/stores/inbox-panel-state";
import { InboxDocument } from "../InboxDocument";
import { SessionSidecar } from "../SessionSidecar";
import { InboxCardPage } from "./components/InboxCardPage";
import { useInboxCard } from "./hooks/useInboxCard";

const SIDECAR_DEFAULT_WIDTH = 520;
const SIDECAR_MIN_WIDTH = 320;
const SIDECAR_MAX_WIDTH = 960;

interface InboxCardViewProps {
	cardId: string;
}

export function InboxCardView({ cardId }: InboxCardViewProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const setPanelOpen = useInboxPanelStore((s) => s.setOpen);
	const [commentsEnabled, setCommentsEnabled] = useState(false);
	const [sessionOpen, setSessionOpen] = useState(false);
	// Mounted a frame before it widens, and until it has shrunk back, so the
	// sidecar slides the document aside rather than popping in.
	const [sidecarPresent, setSidecarPresent] = useState(false);
	const [sidecarExpanded, setSidecarExpanded] = useState(false);
	useEffect(() => {
		if (!sessionOpen) {
			setSidecarExpanded(false);
			return;
		}
		setSidecarPresent(true);
		const frame = requestAnimationFrame(() => setSidecarExpanded(true));
		return () => cancelAnimationFrame(frame);
	}, [sessionOpen]);
	const [sidecarWidth, setSidecarWidth] = useState(SIDECAR_DEFAULT_WIDTH);
	const [sidecarResizing, setSidecarResizing] = useState(false);
	const utils = cloudTrpc.useUtils();

	const { card, document } = useInboxCard(cardId);
	// The card's title and reason paint first; a heavy document follows in the next commit.
	const [paintedId, setPaintedId] = useState(cardId);
	useEffect(() => {
		startTransition(() => setPaintedId(cardId));
	}, [cardId]);
	const linkedPage = cloudTrpc.page.pull.useQuery(
		{ id: card.data?.page?.id ?? "" },
		{ enabled: Boolean(card.data?.page) },
	);
	const { threads } = usePageCommentThreads({
		pageId: card.data?.page?.id ?? "",
		version: linkedPage.data?.version ?? 0,
	});
	const afterChange = () => {
		void utils.inbox.get.invalidate({ id: cardId });
		void utils.inbox.document.invalidate({ id: cardId });
		void utils.inbox.list.invalidate();
		void utils.inbox.count.invalidate();
	};
	const onError = (error: unknown) => toast.error(errorMessage(error));
	const { advanceFrom } = useInboxSelection();
	const afterSettle = (settled: { resolvedAt: Date | null }) => {
		if (settled.resolvedAt !== null) advanceFrom(cardId);
		afterChange();
	};
	const resolve = cloudTrpc.inbox.resolve.useMutation({
		onSuccess: afterSettle,
		onError,
	});
	const answer = cloudTrpc.inbox.answer.useMutation({
		onSuccess: afterSettle,
		onError,
	});
	const actedOn = useRef<number | undefined>(undefined);
	const act = cloudTrpc.inbox.act.useMutation({
		onSuccess: (result) => afterSettle(result.card),
		onSettled: () => {
			actedOn.current = undefined;
		},
	});
	const version = document.data?.version;
	useEffect(() => {
		if (actedOn.current === undefined) actedOn.current = version;
	}, [version]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new card starts with no action in flight
	useEffect(() => {
		actedOn.current = undefined;
	}, [cardId]);
	const actFailure =
		act.error && act.variables?.id === cardId
			? { blockId: act.variables.blockId, message: errorMessage(act.error) }
			: null;
	const acted = act.isSuccess && act.variables.id === cardId ? act : null;
	const actedBlockId = acted?.variables.blockId;
	const actedNotice = acted?.data.resolved.notice;
	const shownDocument = useMemo(() => {
		const blocks = document.data?.blocks;
		if (!document.data || !blocks || !actedNotice) return document.data;
		return {
			...document.data,
			blocks: blocks.map((block) =>
				block.type === "card" &&
				block.id === actedBlockId &&
				!block.resolved.notice
					? { ...block, resolved: { ...block.resolved, notice: actedNotice } }
					: block,
			),
		};
	}, [document.data, actedBlockId, actedNotice]);
	const markRead = cloudTrpc.inbox.markRead.useMutation({
		onSuccess: (read) => {
			utils.inbox.get.setData({ id: read.id }, read);
			void utils.inbox.list.invalidate();
			void utils.inbox.count.invalidate();
		},
	});
	const unread =
		card.data && !card.isPlaceholderData ? card.data.readAt === null : false;
	const markReadMutate = markRead.mutate;
	useEffect(() => {
		if (unread) markReadMutate({ id: cardId, read: true });
	}, [unread, cardId, markReadMutate]);
	const outcomeLabel = useInboxOutcomeLabel();
	const { workspaces } = useHostWorkspaces();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const binding = useTerminalAgentBinding(
		card.data?.workspaceId ?? "",
		card.data?.agentSessionId ?? "",
	);
	const agentIcon = usePresetIcon(binding?.agentId ?? "");
	const openWorkspace = () => {
		if (!card.data?.workspaceId) return;
		void navigateToV2Workspace(card.data.workspaceId, navigate, {
			search: {
				terminalId: card.data.agentSessionId,
				focusRequestId: card.data.id,
			},
		});
	};

	if (card.isPending) {
		return (
			<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
				<PageHeader
					className="shadow-[inset_0_-1px_0_var(--border)]"
					start={<Spinner className="size-3.5" />}
				/>
			</div>
		);
	}

	if (!card.data) {
		return (
			<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
				<PageHeader
					className="shadow-[inset_0_-1px_0_var(--border)]"
					start={
						card.error?.data?.code === "NOT_FOUND" ? (
							<span className="text-sm text-muted-foreground">
								<Trans>This card is gone.</Trans>
							</span>
						) : (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Trans>This card could not be loaded.</Trans>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									disabled={card.isFetching}
									onClick={() => void card.refetch()}
								>
									<Trans>Try again</Trans>
								</Button>
							</div>
						)
					}
				/>
			</div>
		);
	}

	const data = card.data;
	const done = data.resolvedAt !== null;
	const workspaceName =
		workspaces.find((w) => w.id === data.workspaceId)?.name ??
		cloudWorkspaces?.find((w) => w.id === data.workspaceId)?.name;
	const senderName =
		data.sentBy && data.sentBy.id !== data.recipientId
			? data.sentBy.name
			: binding
				? AGENT_IDENTITY_LABELS[binding.agentId]
				: data.sentBy
					? t({ message: "An agent" })
					: "Superset";
	const sender = {
		name: senderName,
		workspace: workspaceName,
		mark:
			binding && agentIcon ? (
				<img src={agentIcon} alt="" className="size-3.5 shrink-0" />
			) : undefined,
	};
	const notice = data.outcome?.notice as { text?: unknown } | undefined;
	const outcomeNote =
		typeof notice?.text === "string" ? notice.text : undefined;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<PageHeader
				className="shadow-[inset_0_-1px_0_var(--border)]"
				start={
					<div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
						<button
							type="button"
							onClick={() => setPanelOpen(true)}
							className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-fill-hover hover:text-foreground"
						>
							<LuInbox className="size-3.5 shrink-0" strokeWidth={1.5} />
							<Trans>Inbox</Trans>
						</button>
						<span className="shrink-0">/</span>
						<span className="truncate font-medium text-foreground">
							{data.sentBy && data.sentBy.id !== data.recipientId
								? data.sentBy.name
								: data.title}
						</span>
						<span className="shrink-0">
							· {formatRelativeTime(data.createdAt)}
						</span>
					</div>
				}
				end={
					<div className="flex shrink-0 items-center gap-1">
						{data.page && (
							<CommentModeButton
								enabled={commentsEnabled}
								openCount={threads.filter((thread) => !thread.resolved).length}
								onToggle={() => setCommentsEnabled(!commentsEnabled)}
							/>
						)}
						{!done && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 px-2 text-xs"
								disabled={resolve.isPending}
								onClick={() =>
									resolve.mutate({
										id: data.id,
										outcome: { kind: "archived" },
									})
								}
							>
								<Archive className="size-3.5" />
								<Trans>Archive</Trans>
							</Button>
						)}
					</div>
				}
			/>

			<div className="flex min-h-0 min-w-0 flex-1">
				<div
					data-inbox-scope
					className="relative flex min-h-0 min-w-0 flex-1 flex-col"
				>
					{data.workspaceId && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									aria-pressed={sessionOpen}
									tabIndex={sessionOpen ? -1 : 0}
									className={cn(
										"absolute top-3 right-3 z-10 h-7 gap-1.5 bg-background/80 px-2 text-xs shadow-sm backdrop-blur transition-opacity duration-200",
										sessionOpen && "pointer-events-none opacity-0",
									)}
									onClick={() => setSessionOpen(true)}
								>
									<LuTerminal className="size-3.5" strokeWidth={1.5} />
									<Trans>Show session</Trans>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<Trans>The terminal this card came from, beside the card</Trans>
							</TooltipContent>
						</Tooltip>
					)}
					{data.page ? (
						<div className="min-h-0 min-w-0 flex-1">
							<PageViewer
								key={data.page.id}
								slug={data.page.slug}
								pageId={data.page.id}
								title={data.page.title}
								commentsEnabled={commentsEnabled}
								onCommentsEnabledChange={setCommentsEnabled}
							/>
						</div>
					) : (
						<div className="min-h-0 flex-1 overflow-y-auto">
							<InboxCardPage
								title={data.title}
								why={data.why}
								sender={sender}
								body={data.hasDocument ? null : data.body}
								outcome={
									done
										? {
												label: outcomeLabel(data.outcome?.kind),
												note: outcomeNote,
											}
										: null
								}
							>
								{data.hasDocument ? (
									shownDocument && paintedId === data.id ? (
										<InboxDocument
											key={data.id}
											document={shownDocument}
											done={done}
											pending={
												answer.isPending || act.isPending || document.isFetching
											}
											failure={actFailure}
											onAnswer={(questionId, value) =>
												answer.mutate({
													id: data.id,
													answers: { [questionId]: value },
												})
											}
											onSkip={(questionId) =>
												answer.mutate({
													id: data.id,
													answers: {},
													skip: [questionId],
												})
											}
											onAct={(blockId, actionId, input, confirm) =>
												act.mutate({
													id: data.id,
													blockId,
													actionId,
													input,
													confirm,
													ifVersion: actedOn.current ?? version,
												})
											}
											onConnect={(href) => navigate({ href })}
										/>
									) : (
										<div className="flex justify-center py-6">
											<Spinner className="size-4" />
										</div>
									)
								) : (
									!done && (
										<div className="flex justify-end">
											<Button
												type="button"
												size="sm"
												disabled={resolve.isPending}
												onClick={() =>
													resolve.mutate({
														id: data.id,
														outcome: { kind: "answered" },
													})
												}
											>
												<Check className="size-3.5" />
												<Trans>Done</Trans>
											</Button>
										</div>
									)
								)}
							</InboxCardPage>
						</div>
					)}
				</div>
				{sidecarPresent && data.workspaceId && (
					<div
						onTransitionEnd={(event) => {
							if (
								event.target === event.currentTarget &&
								event.propertyName === "width" &&
								!sessionOpen
							)
								setSidecarPresent(false);
						}}
						className={cn(
							"flex h-full shrink-0 justify-end overflow-hidden",
							!sidecarResizing && "transition-[width] duration-200 ease-out",
						)}
						style={{ width: sidecarExpanded ? sidecarWidth : 0 }}
					>
						<ResizablePanel
							width={sidecarWidth}
							onWidthChange={setSidecarWidth}
							isResizing={sidecarResizing}
							onResizingChange={setSidecarResizing}
							minWidth={SIDECAR_MIN_WIDTH}
							maxWidth={SIDECAR_MAX_WIDTH}
							handleSide="left"
							onDoubleClickHandle={() => setSidecarWidth(SIDECAR_DEFAULT_WIDTH)}
						>
							<SessionSidecar
								cardId={data.id}
								workspaceId={data.workspaceId}
								terminalId={data.agentSessionId}
								onClose={() => setSessionOpen(false)}
								onOpenWorkspace={openWorkspace}
							/>
						</ResizablePanel>
					</div>
				)}
			</div>
		</div>
	);
}
