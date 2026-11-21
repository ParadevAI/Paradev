import { useLingui } from "@lingui/react/macro";
import { useHotkeyDisplay } from "renderer/hotkeys";
import type { MenuParts } from "renderer/lib/menuParts";
import { useWorkspaceOpenIn } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceOpenIn";
import { useWorkspaceOpenInTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceOpenInTarget";

interface WorkspaceOpenInDefaultItemProps {
	parts: MenuParts;
	workspaceId: string;
}

export function WorkspaceOpenInDefaultItem({
	parts,
	workspaceId,
}: WorkspaceOpenInDefaultItemProps) {
	const { t } = useLingui();
	const { Item, Shortcut } = parts;
	const target = useWorkspaceOpenInTarget(workspaceId);
	const { currentApp, isDark, isLoading, openInDefaultApp } =
		useWorkspaceOpenIn({
			worktreePath: target?.worktreePath ?? null,
			projectId: target?.projectId ?? null,
			hotkeys: false,
		});
	const shortcut = useHotkeyDisplay("OPEN_IN_APP").text;

	if (!currentApp) return null;
	return (
		<Item disabled={!target || isLoading} onSelect={openInDefaultApp}>
			<img
				src={isDark ? currentApp.darkIcon : currentApp.lightIcon}
				alt=""
				className="size-4 object-contain"
			/>
			{t({
				message: `Open in ${currentApp.displayLabel ?? currentApp.label}`,
			})}
			{shortcut !== "Unassigned" && <Shortcut>{shortcut}</Shortcut>}
		</Item>
	);
}
