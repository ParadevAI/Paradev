import { OpenInExternalDropdownItems } from "renderer/components/OpenInExternalDropdown";
import type { MenuParts } from "renderer/lib/menuParts";
import { useWorkspaceOpenIn } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceOpenIn";
import { useWorkspaceOpenInTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceOpenInTarget";

interface WorkspaceOpenInAppsProps {
	parts: MenuParts;
	workspaceId: string;
}

export function WorkspaceOpenInApps({
	parts,
	workspaceId,
}: WorkspaceOpenInAppsProps) {
	const target = useWorkspaceOpenInTarget(workspaceId);
	const { resolvedApp, isDark, openInOtherApp } = useWorkspaceOpenIn({
		worktreePath: target?.worktreePath ?? null,
		projectId: target?.projectId ?? null,
		hotkeys: false,
	});

	return (
		<OpenInExternalDropdownItems
			parts={parts}
			isDark={isDark}
			activeApp={resolvedApp}
			onOpenIn={openInOtherApp}
			subContentClassName="w-40"
			appContentClassName="gap-0"
			appIconClassName="size-4 object-contain mr-2"
			subTriggerIconClassName="size-4 object-contain mr-2"
			subTriggerContentClassName="flex items-center gap-0"
		/>
	);
}
