import { Trans } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

export function PrimaryRepositoryBadge() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge variant="secondary" className="shrink-0 cursor-default">
					<Trans>Primary</Trans>
				</Badge>
			</TooltipTrigger>
			<TooltipContent className="max-w-64">
				<Trans>
					Workspace setup and run commands, agent settings and MCP servers come
					from the primary repository.
				</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
