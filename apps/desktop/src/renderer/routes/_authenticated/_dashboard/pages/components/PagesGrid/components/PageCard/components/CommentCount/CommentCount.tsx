import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import type { CommentPreviewTrigger } from "../../hooks/useCommentPreview";

interface CommentCountProps {
	slug: string;
	count: number;
	unread: boolean;
	open: boolean;
	panelId: string | undefined;
	countRef: CommentPreviewTrigger["countRef"];
	triggerProps: CommentPreviewTrigger["countProps"];
}

/**
 * The card's comment count: a link to the page's comment thread that also
 * triggers the preview panel. Card hover only puts it into its chip state;
 * the chip holds while the panel is open.
 */
export function CommentCount({
	slug,
	count,
	unread,
	open,
	panelId,
	countRef,
	triggerProps,
}: CommentCountProps) {
	const { t } = useLingui();
	const label = unread
		? t({
				message: plural(count, {
					one: "# comment, new replies",
					other: "# comments, new replies",
				}),
			})
		: t({
				message: plural(count, {
					one: "# comment",
					other: "# comments",
				}),
			});

	return (
		<Link
			ref={countRef}
			to="/pages/$slug"
			params={{ slug }}
			search={{ comments: true }}
			aria-label={label}
			aria-describedby={panelId}
			data-open={open ? "" : undefined}
			className={cn(
				"-my-0.5 -mr-1.5 relative z-10 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs transition-colors",
				"group-hover:bg-accent group-hover:text-foreground",
				"hover:bg-accent hover:text-foreground",
				"data-[open]:bg-accent data-[open]:text-foreground",
				"focus-visible:bg-accent focus-visible:text-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
			{...triggerProps}
		>
			<span aria-hidden="true" className="relative flex">
				<MessageCircle className="size-3.5" />
				{unread ? (
					<span className="-top-0.5 -right-0.5 absolute size-1.5 rounded-full bg-blue-600 ring-[1.5px] ring-card" />
				) : null}
			</span>
			<span className={cn("tabular-nums", unread && "text-foreground")}>
				{count}
			</span>
		</Link>
	);
}
