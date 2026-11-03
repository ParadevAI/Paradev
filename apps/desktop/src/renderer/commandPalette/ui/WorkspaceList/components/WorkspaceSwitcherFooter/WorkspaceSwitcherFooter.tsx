import { useLingui } from "@lingui/react/macro";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import type { ReactNode } from "react";
import { PLATFORM, useHotkeyDisplay } from "renderer/hotkeys";
import type { SwitcherSelection } from "../../../../core/frames";

function Hint({ keys, label }: { keys: string[]; label: ReactNode }) {
	return (
		<span className="flex items-center gap-1.5">
			<KbdGroup>
				{keys.map((key) => (
					<Kbd key={key} className="h-[18px] min-w-[18px] text-[11px]">
						{key}
					</Kbd>
				))}
			</KbdGroup>
			{label}
		</span>
	);
}

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
			<Hint keys={["↵"]} label={t({ message: "Open" })} />
			<Hint
				keys={[modifier, "⌫"]}
				label={
					selection?.hostType === "cloud"
						? t({ message: "Archive" })
						: t({ message: "Delete" })
				}
			/>
			{newWorkspace.keys[0] !== "Unassigned" ? (
				<Hint
					keys={newWorkspace.keys}
					label={t({ message: "New workspace" })}
				/>
			) : null}
			{next.keys[0] !== "Unassigned" ? (
				<span className="ml-auto">
					<Hint keys={next.keys} label={t({ message: "Next" })} />
				</span>
			) : null}
		</div>
	);
}
