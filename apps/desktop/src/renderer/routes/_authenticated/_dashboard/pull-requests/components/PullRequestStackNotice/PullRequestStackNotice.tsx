import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { TriangleAlert } from "lucide-react";

export function PullRequestStackNotice({
	onRefresh,
}: {
	onRefresh: () => void;
}) {
	return (
		<output className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 [.dark_&]:text-amber-300">
			<TriangleAlert
				aria-hidden
				strokeWidth={1.75}
				className="size-3.5 shrink-0"
			/>
			<span className="min-w-0 flex-1">
				<Trans>
					Stack details could not be loaded. Refresh before merging.
				</Trans>
			</span>
			<Button
				variant="ghost"
				size="xs"
				className="h-6 shrink-0 px-2 text-xs text-current hover:bg-amber-500/15 hover:text-current"
				onClick={onRefresh}
			>
				<Trans>Refresh</Trans>
			</Button>
		</output>
	);
}
