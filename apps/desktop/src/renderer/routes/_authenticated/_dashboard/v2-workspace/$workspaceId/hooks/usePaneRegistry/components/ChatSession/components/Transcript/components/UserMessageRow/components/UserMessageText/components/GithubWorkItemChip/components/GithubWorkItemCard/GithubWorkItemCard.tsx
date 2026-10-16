import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import {
	CircleDot,
	CircleX,
	GitCompare,
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
	type LucideIcon,
} from "lucide-react";
import type { GithubWorkItemLink } from "../../../../../../../../../../utils/githubWorkItem";

/** What `github.getWorkItem` answers, as the card reads it. */
export type GithubWorkItemGlance = {
	title: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	summary: string;
	author: { login: string; avatarUrl: string | null } | null;
	baseRefName: string | null;
	headRefName: string | null;
	labels: { name: string; color: string }[];
	assignees: { login: string; avatarUrl: string | null }[];
	updatedAt: string;
};

export type GithubWorkItemLoad =
	| { status: "loading" }
	| { status: "ready"; item: GithubWorkItemGlance }
	| { status: "unavailable" };

const MAX_LABELS = 3;
const MAX_ASSIGNEES = 3;

const STATE_LABELS = {
	pr: msg({ message: "Pull request" }),
	issue: msg({ message: "Issue" }),
	draft: msg({ message: "Draft", context: "pull request state" }),
	merged: msg({ message: "Merged", context: "pull request state" }),
	closed: msg({ message: "Closed", context: "pull request or issue state" }),
	open: msg({ message: "Open", context: "pull request or issue state" }),
};

function statusOf(
	kind: GithubWorkItemLink["kind"],
	item: GithubWorkItemGlance | null,
): {
	Icon: LucideIcon;
	label: (typeof STATE_LABELS)[keyof typeof STATE_LABELS];
	className: string;
} {
	if (!item) {
		return {
			Icon: kind === "pr" ? GitPullRequest : CircleDot,
			label: kind === "pr" ? STATE_LABELS.pr : STATE_LABELS.issue,
			className: "text-foreground/50",
		};
	}
	if (item.draft) {
		return {
			Icon: GitPullRequestDraft,
			label: STATE_LABELS.draft,
			className: "text-foreground/50",
		};
	}
	if (item.state === "merged") {
		return {
			Icon: GitMerge,
			label: STATE_LABELS.merged,
			className: "text-violet-400/90",
		};
	}
	if (item.state === "closed") {
		return {
			Icon: kind === "pr" ? GitPullRequestClosed : CircleX,
			label: STATE_LABELS.closed,
			className: "text-rose-400/90",
		};
	}
	return {
		Icon: kind === "pr" ? GitPullRequest : CircleDot,
		label: STATE_LABELS.open,
		className: "text-emerald-400/90",
	};
}

function labelDot(color: string): string {
	return /^[\da-f]{6}$/i.test(color) ? `#${color}` : "currentColor";
}

function Avatar({
	login,
	avatarUrl,
	size,
}: {
	login: string;
	avatarUrl: string | null;
	size: number;
}) {
	return avatarUrl ? (
		<img
			alt=""
			className="shrink-0 rounded-full border border-background bg-foreground/10 object-cover"
			draggable={false}
			height={size}
			referrerPolicy="no-referrer"
			src={avatarUrl}
			title={login}
			width={size}
		/>
	) : (
		<span
			aria-hidden="true"
			className="grid shrink-0 place-items-center rounded-full border border-background bg-foreground/10 font-medium text-foreground/50"
			style={{ width: size, height: size, fontSize: Math.max(8, size * 0.45) }}
		>
			{login.charAt(0).toUpperCase() || "?"}
		</span>
	);
}

export function GithubWorkItemCard({
	link,
	load,
}: {
	link: GithubWorkItemLink;
	load: GithubWorkItemLoad;
}) {
	const { i18n, t } = useLingui();
	const item = load.status === "ready" ? load.item : null;
	const status = statusOf(link.kind, item);
	const labels = item?.labels ?? [];
	const assignees = item?.assignees ?? [];
	const branches =
		link.kind === "pr" && item?.baseRefName && item.headRefName
			? { base: item.baseRefName, head: item.headRefName }
			: null;
	return (
		<div className="min-w-0 p-3.5 text-left font-sans text-foreground">
			<div className="flex min-w-0 items-center gap-2 text-[11px]">
				<status.Icon
					aria-hidden="true"
					className={cn("size-4 shrink-0", status.className)}
				/>
				<span className="min-w-0 truncate font-medium text-foreground/65">
					{link.owner}/{link.repo}
				</span>
				<span className="shrink-0 text-foreground/35">·</span>
				<span className="shrink-0 font-mono text-foreground/50 tabular-nums">
					#{link.number}
				</span>
				<span
					className={cn(
						"ml-auto shrink-0 rounded-full bg-foreground/[0.07] px-2 py-0.5 font-medium",
						status.className,
					)}
				>
					{i18n._(status.label)}
				</span>
			</div>

			{item ? (
				<>
					<h3 className="mt-2 line-clamp-2 font-semibold text-[13px] text-foreground leading-[1.35]">
						{item.title}
					</h3>
					{item.summary && (
						<p className="mt-1.5 line-clamp-3 text-[11px] text-foreground/55 leading-[1.45]">
							{item.summary}
						</p>
					)}
				</>
			) : load.status === "loading" ? (
				<output
					aria-label={t({ message: "Loading GitHub details" })}
					className="mt-2.5 block space-y-2"
				>
					<div className="h-3 w-4/5 rounded bg-foreground/10 motion-safe:animate-pulse" />
					<div className="h-2 w-full rounded bg-foreground/[0.07] motion-safe:animate-pulse" />
					<div className="h-2 w-2/3 rounded bg-foreground/[0.07] motion-safe:animate-pulse" />
				</output>
			) : (
				<p className="mt-2 text-[11px] text-foreground/50 leading-relaxed">
					<Trans>
						Details are not available here, but the link still opens.
					</Trans>
				</p>
			)}

			{item && (item.author || item.updatedAt) && (
				<div className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[10px] text-foreground/45">
					{item.author && (
						<span className="inline-flex min-w-0 items-center gap-1.5">
							<Avatar
								avatarUrl={item.author.avatarUrl}
								login={item.author.login}
								size={16}
							/>
							<span className="min-w-0 truncate font-medium text-foreground/55">
								{item.author.login}
							</span>
						</span>
					)}
					{item.author && <span aria-hidden="true">·</span>}
					<span className="shrink-0">
						<Trans>
							Updated {formatRelativeTime(new Date(item.updatedAt))}
						</Trans>
					</span>
				</div>
			)}

			{branches && (
				<div className="mt-2 flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/[0.045] px-2 py-1.5 text-[10px] text-foreground/50">
					<GitCompare aria-hidden="true" className="size-3.5 shrink-0" />
					<span className="min-w-0 truncate font-mono">
						{branches.base} ← {branches.head}
					</span>
				</div>
			)}

			{(labels.length > 0 || assignees.length > 0) && (
				<div className="mt-2.5 flex min-w-0 items-center gap-1.5">
					<div className="flex min-w-0 flex-1 flex-wrap gap-1">
						{labels.slice(0, MAX_LABELS).map((label) => (
							<span
								className="inline-flex max-w-28 items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.035] px-1.5 py-0.5 text-[9px] text-foreground/55"
								key={label.name}
							>
								<span
									aria-hidden="true"
									className="size-1.5 shrink-0 rounded-full"
									style={{ backgroundColor: labelDot(label.color) }}
								/>
								<span className="truncate">{label.name}</span>
							</span>
						))}
						{labels.length > MAX_LABELS && (
							<span className="px-1 text-[9px] text-foreground/35">
								+{labels.length - MAX_LABELS}
							</span>
						)}
					</div>
					{assignees.length > 0 && (
						<div className="-space-x-1 flex shrink-0">
							{assignees.slice(0, MAX_ASSIGNEES).map((person) => (
								<Avatar
									avatarUrl={person.avatarUrl}
									key={person.login}
									login={person.login}
									size={18}
								/>
							))}
						</div>
					)}
				</div>
			)}

			<div className="mt-3 border-foreground/[0.07] border-t pt-2 text-[10px] text-foreground/35">
				{link.kind === "pr" ? (
					<Trans>Click the chip to open the pull request</Trans>
				) : (
					<Trans>Click the chip to open the issue</Trans>
				)}
			</div>
		</div>
	);
}
