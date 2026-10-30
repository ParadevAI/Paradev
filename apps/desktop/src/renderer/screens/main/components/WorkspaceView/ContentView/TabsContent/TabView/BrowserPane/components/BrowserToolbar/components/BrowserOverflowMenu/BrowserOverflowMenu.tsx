import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { type RefObject, useRef, useState } from "react";
import {
	TbApps,
	TbCamera,
	TbClock,
	TbCopy,
	TbDots,
	TbExternalLink,
	TbReload,
	TbTrash,
} from "react-icons/tb";
import {
	BrowserExtensionsSubmenu,
	PinnedExtensionRows,
	RemoveExtensionDialog,
	useBrowserExtensionsMenu,
} from "renderer/components/BrowserExtensions";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

interface BrowserOverflowMenuProps {
	paneId: string;
	/** Whether a real page is loaded (not about:blank) */
	hasPage: boolean;
	extensions: BrowserExtension[];
	pinnedExtensionsRef: RefObject<HTMLElement | null>;
	onNavigate: (url: string) => void;
}

export function BrowserOverflowMenu({
	paneId,
	hasPage,
	extensions,
	pinnedExtensionsRef,
	onNavigate,
}: BrowserOverflowMenuProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const extensionsMenu = useBrowserExtensionsMenu(pinnedExtensionsRef);
	const screenshotMutation = electronTrpc.browser.screenshot.useMutation();
	const reloadMutation = electronTrpc.browser.reload.useMutation();
	const clearBrowsingDataMutation =
		electronTrpc.browser.clearBrowsingData.useMutation();
	const clearHistoryMutation = electronTrpc.browserHistory.clear.useMutation();
	const openExternalMutation = electronTrpc.external.openUrl.useMutation();
	const currentUrl = useTabsStore((s) => s.panes[paneId]?.browser?.currentUrl);

	const handleScreenshot = () => {
		screenshotMutation.mutate({ paneId });
	};

	const handleHardReload = () => {
		reloadMutation.mutate({ paneId, hard: true });
	};

	const { copyToClipboard } = useCopyToClipboard();

	const handleCopyUrl = () => {
		if (currentUrl) {
			copyToClipboard(currentUrl);
		}
	};

	const handleOpenExternal = () => {
		if (currentUrl) {
			openExternalMutation.mutate(currentUrl);
		}
	};

	const handleClearCookies = () => {
		clearBrowsingDataMutation.mutate({ type: "cookies" });
	};

	const handleClearHistory = () => {
		clearHistoryMutation.mutate();
	};

	const handleClearAllData = () => {
		clearBrowsingDataMutation.mutate({ type: "all" });
	};

	return (
		<>
			<DropdownMenu
				open={isMenuOpen}
				onOpenChange={(open) => {
					setIsMenuOpen(open);
					extensionsMenu.onMenuOpenChange(open);
				}}
			>
				<DropdownMenuTrigger asChild>
					<button
						ref={triggerRef}
						type="button"
						className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<TbDots className="size-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					{extensionsMenu.pinnedInMenu && (
						<PinnedExtensionRows
							paneId={paneId}
							extensions={extensions}
							anchorRef={triggerRef}
						/>
					)}
					<DropdownMenuItem
						onClick={handleScreenshot}
						disabled={!hasPage}
						className="gap-2"
					>
						<TbCamera className="size-4" />
						Take Screenshot
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={handleHardReload}
						disabled={!hasPage}
						className="gap-2"
					>
						<TbReload className="size-4" />
						Hard Reload
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={handleCopyUrl}
						disabled={!hasPage}
						className="gap-2"
					>
						<TbCopy className="size-4" />
						Copy URL
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={handleOpenExternal}
						disabled={!hasPage}
						className="gap-2"
					>
						<TbExternalLink className="size-4" />
						Open in Browser
					</DropdownMenuItem>
					<BrowserExtensionsSubmenu
						paneId={paneId}
						extensions={extensions}
						anchorRef={triggerRef}
						onRemove={(extension) => {
							setIsMenuOpen(false);
							extensionsMenu.requestRemove(extension);
						}}
						onOpenUrl={onNavigate}
						icon={<TbApps className="size-4" />}
					/>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleClearHistory} className="gap-2">
						<TbClock className="size-4" />
						Clear Browsing History
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleClearCookies} className="gap-2">
						<TbTrash className="size-4" />
						Clear Cookies
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleClearAllData} className="gap-2">
						<TbTrash className="size-4" />
						Clear All Data
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<RemoveExtensionDialog
				extension={extensionsMenu.removeTarget}
				open={extensionsMenu.isRemoveOpen}
				onOpenChange={extensionsMenu.setIsRemoveOpen}
			/>
		</>
	);
}
