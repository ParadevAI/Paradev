import { Trans } from "@lingui/react/macro";
import { LuSearch } from "react-icons/lu";
import { SidebarKbdHint } from "renderer/components/SidebarKbdHint";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useCommandPaletteToggle } from "../../hooks/useCommandPaletteToggle";

export function SidebarSearchButton() {
	const paletteToggle = useCommandPaletteToggle();
	const shortcutText = useHotkeyDisplay("OPEN_COMMAND_PALETTE").text;
	return (
		<button
			type="button"
			onPointerDown={paletteToggle.onPointerDown}
			onClick={paletteToggle.onClick}
			className="group flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
		>
			<LuSearch
				className="size-4 shrink-0 text-muted-foreground"
				strokeWidth={1.5}
			/>
			<span className="flex-1 text-left">
				<Trans>Search</Trans>
			</span>
			{shortcutText !== "Unassigned" && <SidebarKbdHint label={shortcutText} />}
		</button>
	);
}
