import { Trans, useLingui } from "@lingui/react/macro";
import { formatAge, formatDate } from "@superset/i18n/format";
import {
	AGENT_IDENTITY_LABELS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import type { RouterOutputs } from "@superset/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { TerminalSquare } from "lucide-react";
import type { MouseEvent } from "react";
import { LuArchive } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import {
	BRAND_NAMES,
	BrandMark,
} from "renderer/routes/_authenticated/_dashboard/components/BrandMark";
import { RecordInlineLink } from "renderer/routes/_authenticated/_dashboard/components/RecordInlineLink";
import { useInboxOutcomeLabel } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxOutcomeLabel";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import type { InboxView } from "renderer/stores/inbox-panel-state";
import { InboxCardShell, inboxPillButton } from "../InboxCardShell";
import { MarkReadIcon } from "./components/MarkReadIcon";

type Card = RouterOutputs["inbox"]["list"]["items"][number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface InboxCardProps {
	card: Card;
	/** The row the detail pane shows. */
	selected?: boolean;
	view: InboxView;
	now: Date;
	/** The agent running in the sending session, when its host still reports it. */
	agentId?: AgentIdentityId;
	/** The local project's icon, or the cloud workspace's primary repository owner. */
	projectIconUrl?: string | null;
	workspaceName?: string;
	onOpen: () => void;
	onOpenSession: () => void;
	onArchive: () => void;
	onMarkRead: (read: boolean) => void;
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

/** "2m", "23h", "3d" inside a week; "Sep 22" beyond it. */
function cardTime(date: Date, now: Date): string {
	return now.getTime() - date.getTime() < WEEK_MS
		? formatAge(date, now.getTime())
		: formatDate(date, { month: "short", day: "numeric" });
}

const stop = (handler: () => void) => (event: MouseEvent) => {
	event.stopPropagation();
	handler();
};

export function InboxCard({
	card,
	selected,
	view,
	now,
	agentId,
	projectIconUrl,
	workspaceName,
	onOpen,
	onOpenSession,
	onArchive,
	onMarkRead,
}: InboxCardProps) {
	const { t } = useLingui();
	const toOutcomeLabel = useInboxOutcomeLabel();
	const done = card.resolvedAt !== null;
	const unread = !done && card.readAt === null;
	const when = cardTime(
		view === "archive" && card.resolvedAt
			? card.resolvedAt
			: view === "scheduled" && card.showAt
				? card.showAt
				: card.createdAt,
		now,
	);
	const sender =
		card.sentBy && card.sentBy.id !== card.recipientId ? card.sentBy : null;
	const agentLabel = agentId ? AGENT_IDENTITY_LABELS[agentId] : undefined;
	const agentIcon = usePresetIcon(agentId ?? "");
	const outcomeLabel = toOutcomeLabel(card.outcome?.kind);
	const asks = [...new Map(card.cards.map((b) => [b.ask, b])).values()];

	const origin = sender?.name ?? agentLabel;
	const originMark = sender ? (
		<Avatar className="size-3.5 rounded-sm">
			{sender.image ? <AvatarImage src={sender.image} alt="" /> : null}
			<AvatarFallback className="rounded-sm bg-chart-4/80 text-[7px] font-bold text-white">
				{initials(sender.name)}
			</AvatarFallback>
		</Avatar>
	) : agentIcon ? (
		<img src={agentIcon} alt="" className="size-3.5 shrink-0" />
	) : null;
	const originLabel = [origin, workspaceName].filter(Boolean).join(" · ");
	const avatar = (
		<ProjectThumbnail
			projectName={workspaceName ?? t({ message: "Session" })}
			iconUrl={projectIconUrl}
			className="size-5 text-[9px]"
		/>
	);

	return (
		<InboxCardShell
			itemId={card.id}
			selected={selected}
			dimmed={done}
			icon={avatar}
			title={card.title}
			when={when}
			unread={unread}
			onOpen={onOpen}
			toolbar={
				done ? undefined : (
					<>
						<Tooltip delayDuration={400}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={stop(() => onMarkRead(unread))}
									aria-label={
										unread
											? t({ message: "Mark as read" })
											: t({ message: "Mark as unread" })
									}
									className={inboxPillButton}
								>
									<MarkReadIcon unread={unread} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{unread ? (
									<Trans>Mark as read</Trans>
								) : (
									<Trans>Mark as unread</Trans>
								)}
							</TooltipContent>
						</Tooltip>
						<Tooltip delayDuration={400}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={stop(onArchive)}
									aria-label={t({ message: "Archive" })}
									className={inboxPillButton}
								>
									<LuArchive className="size-3.5" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<Trans>Archive. The agent is told.</Trans>
							</TooltipContent>
						</Tooltip>
					</>
				)
			}
		>
			<span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
				{card.body ?? card.why}
			</span>
			{(origin || workspaceName) && (
				<span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
					<span className="shrink-0">
						<Trans>From</Trans>
					</span>
					{card.workspaceId ? (
						<Tooltip delayDuration={400}>
							<TooltipTrigger asChild>
								<span className="flex min-w-0">
									<RecordInlineLink
										icon={
											originMark ?? (
												<TerminalSquare className="size-3.5 text-muted-foreground" />
											)
										}
										onClick={stop(onOpenSession)}
									>
										{originLabel}
									</RecordInlineLink>
								</span>
							</TooltipTrigger>
							<TooltipContent side="bottom" align="start">
								<Trans>Open the session this card came from</Trans>
							</TooltipContent>
						</Tooltip>
					) : (
						<span className="flex min-w-0 items-center gap-1.5 px-1 py-0.5">
							{originMark}
							<span className="truncate">{originLabel}</span>
						</span>
					)}
				</span>
			)}

			{done ? (
				<div className="mt-0.5 flex justify-end text-[11px] text-muted-foreground">
					{outcomeLabel}
				</div>
			) : (
				asks.length > 0 && (
					<div className="mt-0.5 flex items-center gap-2">
						<HoverCard openDelay={200} closeDelay={100}>
							<HoverCardTrigger asChild>
								<span className="flex min-w-0 items-center gap-1.5 text-[11px] text-foreground/90">
									<BrandMark brand={asks[0].brand} className="size-4" />
									<span className="truncate">{asks[0].ask}</span>
									{asks.length > 1 && (
										<span className="shrink-0 text-muted-foreground">
											+{asks.length - 1}
										</span>
									)}
								</span>
							</HoverCardTrigger>
							<HoverCardContent
								side="bottom"
								align="start"
								sideOffset={6}
								className="w-60 p-1"
							>
								<div className="px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
									<Trans>Actions</Trans>
								</div>
								{asks.map((b) => (
									<div
										key={b.ask}
										className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs"
									>
										<BrandMark brand={b.brand} className="size-4" />
										<span className="min-w-0 flex-1 truncate">{b.ask}</span>
										<span className="shrink-0 text-[11px] text-muted-foreground">
											{BRAND_NAMES[b.brand ?? "superset"]}
										</span>
									</div>
								))}
							</HoverCardContent>
						</HoverCard>
					</div>
				)
			)}
		</InboxCardShell>
	);
}
