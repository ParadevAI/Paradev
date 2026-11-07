import { useLingui } from "@lingui/react/macro";
import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import { ArrowRight } from "lucide-react";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import type { PullRequestActionTarget } from "../../hooks/usePullRequestDraftMutation";
import { PullRequestDraftStateMenu } from "../PullRequestDraftStateMenu";
import { PullRequestStatePill } from "../PullRequestStatePill";
import { PullRequestCopyText } from "./components/PullRequestCopyText";

interface PullRequestItemHeaderProps {
	data: PullRequestDetail;
	/** Where state changes post; null leaves the pill inert. */
	actionTarget?: PullRequestActionTarget | null;
	className?: string;
}

/**
 * What the Summary opens with: the state pill beside "repo #n", the large
 * title, then author, age, and head → base. Actions live in the top bar.
 */
export function PullRequestItemHeader({
	data,
	actionTarget = null,
	className,
}: PullRequestItemHeaderProps) {
	const { t } = useLingui();
	const repositoryName =
		data.repoFullName.split("/").pop() ?? data.repoFullName;
	const createdAt = data.createdAt ? new Date(data.createdAt) : null;
	const createdAtValid =
		createdAt !== null && !Number.isNaN(createdAt.getTime());
	return (
		<header className={cn("shrink-0 pb-4", className)}>
			<div className="flex min-w-0 items-center gap-2">
				{actionTarget && data.state === "open" ? (
					<PullRequestDraftStateMenu data={data} target={actionTarget} />
				) : (
					<PullRequestStatePill data={data} />
				)}
				<PullRequestCopyText
					value={data.url}
					label={t({ message: "Copy link to pull request" })}
					className="truncate text-xs text-muted-foreground"
				>
					{repositoryName} #{data.number}
				</PullRequestCopyText>
			</div>
			<h1 className="mt-3 select-text break-words text-[1.75rem] font-semibold leading-tight tracking-tight @max-[48rem]/detail:text-2xl @max-[36rem]/detail:mt-2 @max-[36rem]/detail:text-xl">
				{data.title}
			</h1>
			<div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
				{data.author ? (
					<PullRequestCopyText
						value={data.author.login}
						label={t({ message: "Copy username" })}
						className="flex items-center gap-1.5 font-medium text-foreground"
					>
						<Avatar className="size-4 rounded-full ring-1 ring-border/50">
							<AvatarImage
								src={
									data.author.avatarUrl ??
									`https://github.com/${data.author.login}.png?size=64`
								}
								alt=""
							/>
							<AvatarFallback className="text-[8px]">
								{data.author.login.slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<span className="truncate">{data.author.login}</span>
					</PullRequestCopyText>
				) : null}
				{createdAtValid ? (
					<>
						<span aria-hidden>·</span>
						<PullRequestCopyText
							value={formatDateTime(createdAt)}
							label={formatDateTime(createdAt)}
							className="shrink-0"
						>
							<time dateTime={data.createdAt}>
								{formatRelativeTime(createdAt)}
							</time>
						</PullRequestCopyText>
					</>
				) : null}
				<span aria-hidden>·</span>
				<span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground/80">
					<PullRequestCopyText
						value={data.head.ref}
						label={t({ message: "Copy branch name" })}
						className="truncate"
					>
						{data.head.ref}
					</PullRequestCopyText>
					<ArrowRight
						aria-hidden
						strokeWidth={1.75}
						className="size-3.5 shrink-0"
					/>
					<PullRequestCopyText
						value={data.base.ref}
						label={t({ message: "Copy branch name" })}
						className="shrink-0"
					>
						{data.base.ref}
					</PullRequestCopyText>
				</span>
			</div>
			{data.labels && data.labels.length > 0 ? (
				<ul className="mt-3 flex flex-wrap gap-1.5">
					{data.labels.map((label) => (
						<li
							key={label.name}
							className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground"
							style={
								label.color
									? {
											borderColor: `#${label.color}66`,
											color: `color-mix(in srgb, #${label.color} 70%, var(--foreground))`,
										}
									: undefined
							}
						>
							{label.name}
						</li>
					))}
				</ul>
			) : null}
		</header>
	);
}
