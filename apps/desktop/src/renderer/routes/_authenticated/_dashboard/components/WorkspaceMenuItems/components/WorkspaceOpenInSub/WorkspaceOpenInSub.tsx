import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuSquareArrowOutUpRight } from "react-icons/lu";
import type { MenuParts } from "renderer/lib/menuParts";
import { WorkspaceOpenInApps } from "./components/WorkspaceOpenInApps";

interface WorkspaceOpenInSubProps {
	parts: MenuParts;
	workspaceId: string;
}

export function WorkspaceOpenInSub({
	parts,
	workspaceId,
}: WorkspaceOpenInSubProps) {
	const { Sub, SubTrigger, SubContent } = parts;

	return (
		<Sub>
			<SubTrigger>
				<LuSquareArrowOutUpRight
					className={cn("size-4", parts.iconClassName)}
				/>
				<Trans>Open in</Trans>
			</SubTrigger>
			<SubContent className="min-w-48">
				<WorkspaceOpenInApps parts={parts} workspaceId={workspaceId} />
			</SubContent>
		</Sub>
	);
}
