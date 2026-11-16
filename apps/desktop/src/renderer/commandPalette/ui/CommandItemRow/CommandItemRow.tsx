import { useLingui } from "@lingui/react/macro";
import { CommandItem } from "@superset/ui/command";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { ChevronRight } from "lucide-react";
import { useHotkeyDisplay } from "renderer/hotkeys/hooks/useHotkeyDisplay";
import type { Command } from "../../core/types";
import { MatchedText } from "../MatchedText";

interface CommandItemRowProps {
	command: Command;
	onSelect: (command: Command) => void;
	query?: string;
}

export function CommandItemRow({
	command,
	onSelect,
	query = "",
}: CommandItemRowProps) {
	const { i18n } = useLingui();
	const display = useHotkeyDisplay(command.hotkeyId ?? "");
	const Icon = command.icon;
	const hasShortcut =
		Boolean(command.hotkeyId) && display.text && display.text !== "Unassigned";
	const opensFrame = Boolean(command.children || command.renderFrame);
	return (
		<CommandItem
			value={command.id}
			onSelect={() => onSelect(command)}
			className="gap-2.5 text-[13px]"
		>
			<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
				{command.iconUrl ? (
					<img
						src={command.iconUrl}
						alt=""
						className="size-4 shrink-0 object-contain"
					/>
				) : Icon ? (
					<Icon className="size-4" />
				) : null}
			</span>
			<span className="min-w-0 flex-1 truncate">
				<MatchedText text={i18n._(command.title)} query={query} />
			</span>
			{hasShortcut ? (
				<KbdGroup className="ml-auto">
					{display.keys.map((key, index) => (
						<Kbd
							// Chords never repeat a key, but a cap has no identity beyond its position.
							key={`${index}-${key}`}
							className="h-[18px] min-w-[18px] text-[11px]"
						>
							{key}
						</Kbd>
					))}
				</KbdGroup>
			) : opensFrame ? (
				<ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
			) : null}
		</CommandItem>
	);
}
