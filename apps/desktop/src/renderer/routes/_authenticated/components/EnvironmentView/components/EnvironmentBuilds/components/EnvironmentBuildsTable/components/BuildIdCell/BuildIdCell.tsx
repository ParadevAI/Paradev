import { Trans } from "@lingui/react/macro";
import { TableCell } from "@superset/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

interface BuildIdCellProps {
	buildId: string;
}

/** Click to copy, as a variable's value in the environment variables list. */
export function BuildIdCell({ buildId }: BuildIdCellProps) {
	const { copyToClipboard, copied } = useCopyToClipboard(1500);
	const [hovered, setHovered] = useState(false);
	return (
		<TableCell>
			<Tooltip open={hovered}>
				<TooltipTrigger asChild>
					<button
						className="max-w-full cursor-pointer truncate rounded px-1 py-0.5 text-left font-mono text-xs transition-colors hover:bg-accent"
						onClick={() => copyToClipboard(buildId)}
						onMouseEnter={() => setHovered(true)}
						onMouseLeave={() => setHovered(false)}
						type="button"
					>
						{buildId}
					</button>
				</TooltipTrigger>
				<TooltipContent>
					{copied ? <Trans>Copied!</Trans> : <Trans>Click to copy</Trans>}
				</TooltipContent>
			</Tooltip>
		</TableCell>
	);
}
