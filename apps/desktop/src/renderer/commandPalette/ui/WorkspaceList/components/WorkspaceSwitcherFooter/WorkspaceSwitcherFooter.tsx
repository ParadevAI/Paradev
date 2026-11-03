import { useLingui } from "@lingui/react/macro";
import { PLATFORM, useHotkeyDisplay } from "renderer/hotkeys";
import type { SwitcherSelection } from "../../../../core/frames";
import { KeyHint } from "../../../KeyHint";

/** The keys that act on the selected row, so they can be learned without a tooltip. */
export function WorkspaceSwitcherFooter({
	selection,
}: {
	selection: SwitcherSelection | null;
}) {
	const { t } = useLingui();
	const newWorkspace = useHotkeyDisplay("NEW_WORKSPACE");
	const next = useHotkeyDisplay("OPEN_WORKSPACE_LIST");
	const modifier = PLATFORM === "mac" ? "⌘" : "Ctrl";
	return (
		<div className="flex h-8 shrink-0 items-center gap-4 border-t px-3.5 text-[11px] text-muted-foreground">
			<KeyHint keys={["↵"]} label={t({ message: "Open" })} />
			<KeyHint
				keys={[modifier, "⌫"]}
				label={
					selection?.hostType === "cloud"
						? t({ message: "Archive" })
						: t({ message: "Delete" })
				}
			/>
			<KeyHint keys={["#"]} label={t({ message: "All workspaces" })} />
			{newWorkspace.keys[0] !== "Unassigned" ? (
				<KeyHint
					keys={newWorkspace.keys}
					label={t({ message: "New workspace" })}
				/>
			) : null}
			{next.keys[0] !== "Unassigned" ? (
				<span className="ml-auto">
					<KeyHint keys={next.keys} label={t({ message: "Next" })} />
				</span>
			) : null}
		</div>
	);
}
