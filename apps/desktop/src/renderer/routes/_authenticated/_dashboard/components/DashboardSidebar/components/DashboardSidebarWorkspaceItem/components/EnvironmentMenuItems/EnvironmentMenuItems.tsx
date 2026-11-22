import { Trans } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { useNavigate } from "@tanstack/react-router";
import { LuContainer, LuDatabaseBackup } from "react-icons/lu";
import { useSaveCheckpoint } from "renderer/routes/_authenticated/_dashboard/hooks/useSaveCheckpoint";
import { useWorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";

interface EnvironmentMenuItemsProps {
	workspaceId: string;
	onSaveCheckpoint: () => void;
}

/** Rendered only inside an open menu, so closed sidebar rows look nothing up. */
export function EnvironmentMenuItems({
	workspaceId,
	onSaveCheckpoint,
}: EnvironmentMenuItemsProps) {
	const navigate = useNavigate();
	const environment = useWorkspaceEnvironment(workspaceId);
	const checkpoint = useSaveCheckpoint(workspaceId);
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
			{checkpoint.environment && (
				<ContextMenuItem
					disabled={!checkpoint.isReady}
					onSelect={onSaveCheckpoint}
				>
					<LuDatabaseBackup className="size-4 mr-2" />
					<Trans>Save checkpoint</Trans>
				</ContextMenuItem>
			)}
		</>
	);
}
