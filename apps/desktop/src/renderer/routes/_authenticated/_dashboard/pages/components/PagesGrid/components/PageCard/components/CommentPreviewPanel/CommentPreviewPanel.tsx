import { useFormat } from "@superset/i18n/react";
import { firstName, getInitials } from "@superset/shared/names";
import { commentAuthor } from "@superset/shared/page-comments";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import type { CommentPreviewTrigger } from "../../hooks/useCommentPreview";
import type { PageCardCommentPreview } from "../../types";

interface CommentPreviewPanelProps {
	slug: string;
	preview: PageCardCommentPreview;
	panelId: string;
	open: boolean;
	triggerProps: CommentPreviewTrigger["panelProps"];
}

/**
 * The preview a card's comment count opens: one comment in a card-colored
 * bubble floating 12px inside the thumbnail's bottom edge. It stays in the
 * DOM while closed — hidden with opacity, not `display: none` — so the
 * count's `aria-describedby` always resolves, and focusing it opens it.
 */
export function CommentPreviewPanel({
	slug,
	preview,
	panelId,
	open,
	triggerProps,
}: CommentPreviewPanelProps) {
	const { formatCompactRelativeTime } = useFormat();
	const author = commentAuthor(preview);

	return (
		<Link
			id={panelId}
			to="/pages/$slug"
			params={{ slug }}
			search={{ thread: preview.threadId }}
			className={cn(
				"absolute inset-x-3 bottom-3 z-20 block rounded-[10px] border border-border bg-card px-3 pt-[11px] pb-3 text-card-foreground shadow-md",
				"transition-[opacity,translate] duration-150 ease-out motion-reduce:translate-none motion-reduce:transition-none",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				open
					? "translate-y-0 opacity-100"
					: "pointer-events-none translate-y-[5px] opacity-0",
			)}
			{...triggerProps}
		>
			<span className="flex items-center gap-[7px] text-[11px] text-muted-foreground leading-[1.4]">
				<Avatar className="size-5 shrink-0">
					<AvatarImage src={author.image ?? undefined} alt="" />
					<AvatarFallback className="font-medium text-[9px]">
						{author.isAgent ? (
							<Bot className="size-3" />
						) : (
							getInitials(author.name) || "?"
						)}
					</AvatarFallback>
				</Avatar>
				<span className="min-w-0 truncate">
					{author.isAgent ? author.name : firstName(author.name)}
				</span>
				<span className="ml-auto shrink-0">
					{formatCompactRelativeTime(new Date(preview.createdAt))}
				</span>
			</span>
			<span className="mt-1.5 line-clamp-2 text-[13px] text-foreground leading-[1.45]">
				{preview.body}
			</span>
		</Link>
	);
}
