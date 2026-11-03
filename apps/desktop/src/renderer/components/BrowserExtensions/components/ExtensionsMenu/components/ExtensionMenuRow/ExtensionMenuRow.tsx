import { useLingui } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { TbPinned, TbPinnedFilled, TbX } from "react-icons/tb";
import { ExtensionIcon } from "../../../ExtensionIcon";

interface ExtensionMenuRowProps {
	extension: BrowserExtension;
	onActivate: () => void;
	onTogglePin: () => void;
	onRemove: () => void;
}

const ROW_ACTION =
	"shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground";

/**
 * Selecting the row clicks the extension's action, as Chrome's menu does.
 * The trailing buttons are not menu items, so Space pins and Delete removes.
 */
export function ExtensionMenuRow({
	extension,
	onActivate,
	onTogglePin,
	onRemove,
}: ExtensionMenuRowProps) {
	const { t } = useLingui();
	const { name, pinned } = extension;
	return (
		<DropdownMenuItem
			onSelect={onActivate}
			onKeyDown={(event) => {
				if (event.key === " ") {
					event.preventDefault();
					onTogglePin();
				} else if (event.key === "Delete" || event.key === "Backspace") {
					event.preventDefault();
					onRemove();
				}
			}}
			className="justify-between gap-2"
		>
			<span className="flex min-w-0 items-center gap-2">
				<ExtensionIcon extension={extension} className="size-4" />
				<span className="min-w-0 truncate">{name}</span>
			</span>
			<span className="flex shrink-0 items-center gap-0.5">
				<button
					type="button"
					tabIndex={-1}
					aria-pressed={pinned}
					aria-label={t({ message: `Pin ${name}` })}
					onClick={(event) => {
						event.stopPropagation();
						onTogglePin();
					}}
					className={ROW_ACTION}
				>
					{pinned ? (
						<TbPinnedFilled className="size-3.5 text-foreground" />
					) : (
						<TbPinned className="size-3.5" />
					)}
				</button>
				<button
					type="button"
					tabIndex={-1}
					aria-label={t({ message: `Remove ${name}` })}
					onClick={(event) => {
						event.stopPropagation();
						onRemove();
					}}
					className={ROW_ACTION}
				>
					<TbX className="size-3.5" />
				</button>
			</span>
		</DropdownMenuItem>
	);
}
