import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { TableCell } from "@superset/ui/table";
import { HiCheck, HiOutlineClipboardDocument } from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

interface BuildIdCellProps {
	buildId: string;
}

/** The id, with a copy button that shows while the cell is hovered. */
export function BuildIdCell({ buildId }: BuildIdCellProps) {
	const { t } = useLingui();
	const { copyToClipboard, copied } = useCopyToClipboard(1500);
	return (
		<TableCell className="group">
			<div className="flex min-w-0 items-center gap-1">
				<span className="truncate font-mono text-xs" title={buildId}>
					{buildId}
				</span>
				<Button
					aria-label={t({ message: "Copy build ID" })}
					className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
					onClick={() => copyToClipboard(buildId)}
					size="icon"
					variant="ghost"
				>
					{copied ? (
						<HiCheck className="size-3.5" />
					) : (
						<HiOutlineClipboardDocument className="size-3.5" />
					)}
				</Button>
			</div>
		</TableCell>
	);
}
