import { Trans } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { useNavigate } from "@tanstack/react-router";
import { LuContainer } from "react-icons/lu";
import { useWorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";

/** Rendered only inside an open menu, so closed sidebar rows look nothing up. */
export function ManageEnvironmentItem({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const navigate = useNavigate();
	const environment = useWorkspaceEnvironment(workspaceId);
	if (!environment) return null;
	return (
		<>
			<ContextMenuSeparator />
			<ContextMenuItem
				onSelect={() =>
					void navigate({
						to: "/settings/environments/$environmentId",
						params: { environmentId: environment.id },
					})
				}
			>
				<LuContainer className="size-4 mr-2" />
				<Trans>Manage environment</Trans>
			</ContextMenuItem>
		</>
	);
}
