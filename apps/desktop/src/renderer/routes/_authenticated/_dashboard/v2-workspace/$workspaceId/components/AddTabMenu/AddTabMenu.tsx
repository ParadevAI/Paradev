import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenuCheckboxItem,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { BsTerminalPlus } from "react-icons/bs";
import { LuMessageSquare } from "react-icons/lu";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import type { RightPaneKind, RightPaneOption } from "../RightPaneNewTab";

interface AddTabMenuProps {
	onAddTerminal: () => void;
	runAfterClose: (action: () => void) => void;
	onAddChat?: (() => void) | undefined;
	rightPaneOptions?: RightPaneOption[];
	onOpenInRightPane?: (kind: RightPaneKind) => void;
	showPresetsBar: boolean;
	onToggleShowPresetsBar: (enabled: boolean) => void;
}

export function AddTabMenu({
	onAddTerminal,
	runAfterClose,
	onAddChat,
	rightPaneOptions = [],
	onOpenInRightPane,
	showPresetsBar,
	onToggleShowPresetsBar,
}: AddTabMenuProps) {
	const { i18n } = useLingui();
	return (
		<>
			<DropdownMenuItem
				className="gap-2"
				onClick={() => runAfterClose(onAddTerminal)}
			>
				<BsTerminalPlus className="size-4" />
				<span>
					<Trans>Terminal</Trans>
				</span>
				<HotkeyMenuShortcut hotkeyId="NEW_GROUP" />
			</DropdownMenuItem>
			{onAddChat && (
				<DropdownMenuItem className="gap-2" onClick={onAddChat}>
					<LuMessageSquare className="size-4" />
					<span>
						<Trans>Chat</Trans>
					</span>
					<HotkeyMenuShortcut hotkeyId="NEW_CHAT" />
				</DropdownMenuItem>
			)}
			{onOpenInRightPane && rightPaneOptions.length > 0 && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
						<Trans>Open in right pane</Trans>
					</DropdownMenuLabel>
					{rightPaneOptions.map((option) => (
						<DropdownMenuItem
							key={option.kind}
							className="gap-2"
							onClick={() => onOpenInRightPane(option.kind)}
						>
							<option.Icon className="size-4" />
							<span>{i18n._(option.label)}</span>
							{option.hotkeyId && (
								<HotkeyMenuShortcut hotkeyId={option.hotkeyId} />
							)}
						</DropdownMenuItem>
					))}
				</>
			)}
			<DropdownMenuSeparator />
			<DropdownMenuCheckboxItem
				checked={showPresetsBar}
				onCheckedChange={(checked) => onToggleShowPresetsBar(checked === true)}
				onSelect={(event) => event.preventDefault()}
			>
				<Trans>Show Scripts Bar</Trans>
			</DropdownMenuCheckboxItem>
		</>
	);
}
