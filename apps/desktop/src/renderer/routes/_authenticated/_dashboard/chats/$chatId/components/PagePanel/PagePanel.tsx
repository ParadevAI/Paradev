import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuMaximize2, LuX } from "react-icons/lu";
import { PageViewer } from "renderer/routes/_authenticated/_dashboard/components/PageViewer";

const ACTION =
	"flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground";
const ignore = () => {};

interface PagePanelProps {
	slug: string;
	onClose: () => void;
}

/** A page beside the thread: read it without leaving the conversation, or open it whole. */
export function PagePanel({ slug, onClose }: PagePanelProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [title, setTitle] = useState<string | null>(null);
	return (
		<aside className="flex h-full w-[520px] shrink-0 flex-col border-border border-l">
			<div className="flex h-12 shrink-0 items-center gap-1 pr-3 pl-4">
				<h2 className="min-w-0 flex-1 truncate font-medium text-sm">
					{title ?? <Trans>Page</Trans>}
				</h2>
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Open page" })}
							onClick={() =>
								void navigate({ to: "/pages/$slug", params: { slug } })
							}
							className={ACTION}
						>
							<LuMaximize2 className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Open page</Trans>
					</TooltipContent>
				</Tooltip>
				<button
					type="button"
					aria-label={t({ message: "Close" })}
					onClick={onClose}
					className={ACTION}
				>
					<LuX className="size-4" />
				</button>
			</div>
			<div className="relative min-h-0 flex-1">
				<PageViewer
					key={slug}
					slug={slug}
					commentsEnabled={false}
					onCommentsEnabledChange={ignore}
					onResolved={(page) => setTitle(page.title)}
				/>
			</div>
		</aside>
	);
}
