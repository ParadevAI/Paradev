import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import type { PullRequestPreview } from "../../../../hooks/usePullRequestListPreview";
import { PullRequestStatePill } from "../../../PullRequestStatePill";

/** PullRequestItemHeader's first lines, drawn from the list row before the detail arrives. */
export function PullRequestPreviewHeader({
	preview,
}: {
	preview: PullRequestPreview;
}) {
	const repositoryName =
		preview.repoFullName.split("/").pop() ?? preview.repoFullName;
	return (
		<header className="shrink-0 pb-4">
			<div className="flex min-w-0 items-center gap-2">
				<PullRequestStatePill
					data={{
						state: preview.state,
						isDraft: preview.isDraft,
						mergeability: "unknown",
					}}
				/>
				<span
					className="min-w-0 truncate text-xs text-muted-foreground"
					title={preview.repoFullName}
				>
					{repositoryName} #{preview.number}
				</span>
			</div>
			<h1 className="mt-3 select-text break-words text-[1.75rem] font-semibold leading-tight tracking-tight @max-[48rem]/detail:text-2xl @max-[36rem]/detail:mt-2 @max-[36rem]/detail:text-xl">
				{preview.title}
			</h1>
			<div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
				{preview.authorLogin ? (
					<span
						className="flex min-w-0 items-center gap-1.5 font-medium text-foreground"
						title={preview.authorLogin}
					>
						<Avatar className="size-4 rounded-full ring-1 ring-border/50">
							<AvatarImage
								src={`https://github.com/${preview.authorLogin}.png?size=64`}
								alt=""
							/>
							<AvatarFallback className="text-[8px]">
								{preview.authorLogin.slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<span className="truncate">{preview.authorLogin}</span>
					</span>
				) : null}
				{preview.headRef ? (
					<>
						<span aria-hidden>·</span>
						<span
							className="min-w-0 truncate text-[11px] text-muted-foreground/80"
							title={preview.headRef}
						>
							{preview.headRef}
						</span>
					</>
				) : null}
			</div>
		</header>
	);
}
