import { useLingui } from "@lingui/react/macro";
import { LuExternalLink } from "react-icons/lu";
import type { LinearIssueView } from "../../types";
import { LinearStateIcon } from "../LinearStateIcon";

interface LinearIssueHeaderProps {
	issue: Pick<LinearIssueView, "identifier" | "title" | "url" | "state">;
}

/** One line for an issue: status, identifier, title and the way to it in Linear. */
export function LinearIssueHeader({ issue }: LinearIssueHeaderProps) {
	const { t } = useLingui();
	return (
		<div className="flex items-center gap-2 text-[13px]">
			<LinearStateIcon state={issue.state} />
			<span className="shrink-0 tabular-nums text-muted-foreground">
				{issue.identifier}
			</span>
			<span className="min-w-0 flex-1 truncate font-medium text-foreground">
				{issue.title}
			</span>
			<a
				href={issue.url}
				target="_blank"
				rel="noreferrer"
				aria-label={t({ message: "Open in Linear" })}
				className="shrink-0 rounded p-1 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
			>
				<LuExternalLink className="size-3.5" />
			</a>
		</div>
	);
}
