import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuArrowLeft } from "react-icons/lu";
import type { PagePaneData } from "../../../../types";
import { PagePaneTitle } from "../PagePaneTitle";

interface PagesListPaneTitleProps {
	page: PagePaneData;
	pageUiId: string;
	onBack: () => void;
}

export function PagesListPaneTitle({
	page,
	pageUiId,
	onBack,
}: PagesListPaneTitleProps) {
	const { t } = useLingui();
	return (
		<span className="flex min-w-0 items-center gap-1">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Back to pages" })}
						onClick={onBack}
						className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<LuArrowLeft className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Back to pages</Trans>
				</TooltipContent>
			</Tooltip>
			<PagePaneTitle data={page} paneId={pageUiId} onClose={onBack} />
		</span>
	);
}
