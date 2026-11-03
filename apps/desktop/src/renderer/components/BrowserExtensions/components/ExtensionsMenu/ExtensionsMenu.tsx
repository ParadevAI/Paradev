import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { useEffect, useRef, useState } from "react";
import { TbPlus, TbPuzzle } from "react-icons/tb";
import { pointerPassthrough } from "renderer/lib/pointer-passthrough";
import { useActivateBrowserExtension } from "../../hooks/useActivateBrowserExtension";
import { useSetBrowserExtensionPinned } from "../../hooks/useSetBrowserExtensionPinned";
import { RemoveExtensionDialog } from "../RemoveExtensionDialog";
import { ExtensionMenuRow } from "./components/ExtensionMenuRow";
import { CHROME_WEB_STORE_URL, MENU_CLOSE_ANIMATION_MS } from "./constants";

interface ExtensionsMenuProps {
	paneId: string;
	extensions: BrowserExtension[];
	onOpenUrl: (url: string) => void;
	triggerClassName: string;
}

/** The toolbar's puzzle button, as in Chrome: every extension, to open, pin or remove. */
export function ExtensionsMenu({
	paneId,
	extensions,
	onOpenUrl,
	triggerClassName,
}: ExtensionsMenuProps) {
	const { t } = useLingui();
	const activate = useActivateBrowserExtension(paneId);
	const setPinned = useSetBrowserExtensionPinned();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<BrowserExtension | null>(
		null,
	);
	const [isRemoveOpen, setIsRemoveOpen] = useState(false);

	// The webview swallows clicks, so a click on the page passes through to dismiss the menu.
	useEffect(() => {
		const source = `extensions-menu:${paneId}`;
		pointerPassthrough.set(source, isOpen);
		return () => pointerPassthrough.set(source, false);
	}, [paneId, isOpen]);

	const requestRemove = (extension: BrowserExtension) => {
		setIsOpen(false);
		setTimeout(() => {
			setRemoveTarget(extension);
			setIsRemoveOpen(true);
		}, MENU_CLOSE_ANIMATION_MS);
	};

	return (
		<>
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<Tooltip disableHoverableContent>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								ref={triggerRef}
								type="button"
								aria-label={t({ message: "Extensions" })}
								className={triggerClassName}
							>
								<TbPuzzle className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Extensions</Trans>
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="w-64">
					{extensions.length > 0 && (
						<>
							{extensions.map((extension) => (
								<ExtensionMenuRow
									key={extension.id}
									extension={extension}
									onActivate={() => activate(extension, triggerRef.current)}
									onTogglePin={() => setPinned(extension, !extension.pinned)}
									onRemove={() => requestRemove(extension)}
								/>
							))}
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem onSelect={() => onOpenUrl(CHROME_WEB_STORE_URL)}>
						<TbPlus className="size-4" />
						<Trans>Get extensions</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<RemoveExtensionDialog
				extension={removeTarget}
				open={isRemoveOpen}
				onOpenChange={setIsRemoveOpen}
			/>
		</>
	);
}
