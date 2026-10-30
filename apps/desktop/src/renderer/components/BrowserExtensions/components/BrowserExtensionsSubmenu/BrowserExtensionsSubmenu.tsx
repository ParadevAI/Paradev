import { Trans } from "@lingui/react/macro";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import type { ReactNode, RefObject } from "react";
import { TbPlus } from "react-icons/tb";
import { useActivateBrowserExtension } from "../../hooks/useActivateBrowserExtension";
import { useSetBrowserExtensionPinned } from "../../hooks/useSetBrowserExtensionPinned";
import { ExtensionMenuRow } from "./components/ExtensionMenuRow";
import { CHROME_WEB_STORE_URL } from "./constants";

interface BrowserExtensionsSubmenuProps {
	paneId: string;
	extensions: BrowserExtension[];
	/** Popups opened from this menu hang under this control. */
	anchorRef: RefObject<HTMLElement | null>;
	onRemove: (extension: BrowserExtension) => void;
	onOpenUrl: (url: string) => void;
	icon?: ReactNode;
}

export function BrowserExtensionsSubmenu({
	paneId,
	extensions,
	anchorRef,
	onRemove,
	onOpenUrl,
	icon,
}: BrowserExtensionsSubmenuProps) {
	const activate = useActivateBrowserExtension(paneId);

	const setPinned = useSetBrowserExtensionPinned();

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				{icon}
				<Trans>Extensions</Trans>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-64">
				{extensions.map((extension) => (
					<ExtensionMenuRow
						key={extension.id}
						extension={extension}
						onActivate={() => activate(extension, anchorRef.current)}
						onTogglePin={() => setPinned(extension, !extension.pinned)}
						onRemove={() => onRemove(extension)}
					/>
				))}
				{extensions.length > 0 && <DropdownMenuSeparator />}
				<DropdownMenuItem onSelect={() => onOpenUrl(CHROME_WEB_STORE_URL)}>
					<TbPlus className="size-4" />
					<Trans>Get extensions</Trans>
				</DropdownMenuItem>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
