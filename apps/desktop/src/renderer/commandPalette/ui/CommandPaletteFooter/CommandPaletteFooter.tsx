import { useLingui } from "@lingui/react/macro";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { KeyHint } from "../KeyHint";

/** The commands root's footer: how to open, reach every workspace, or narrow to commands. */
export function CommandPaletteFooter() {
	const { t } = useLingui();
	const switcher = useHotkeyDisplay("OPEN_WORKSPACE_LIST");
	return (
		<div className="flex h-8 shrink-0 items-center gap-4 border-t px-3.5 text-[11px] text-muted-foreground">
			<KeyHint keys={["↵"]} label={t({ message: "Open" })} />
			{switcher.keys[0] !== "Unassigned" ? (
				<KeyHint
					keys={switcher.keys}
					label={t({ message: "All workspaces" })}
				/>
			) : null}
			<KeyHint keys={[">"]} label={t({ message: "Commands only" })} />
			<span className="ml-auto">
				<KeyHint keys={["esc"]} label={t({ message: "Close" })} />
			</span>
		</div>
	);
}
