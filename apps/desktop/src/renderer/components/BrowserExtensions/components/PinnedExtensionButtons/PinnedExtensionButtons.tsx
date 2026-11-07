import { cn } from "@superset/ui/utils";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { useActivateBrowserExtension } from "../../hooks/useActivateBrowserExtension";
import { useSetBrowserExtensionPinned } from "../../hooks/useSetBrowserExtensionPinned";
import { ExtensionToolbarButton } from "./components/ExtensionToolbarButton";

interface PinnedExtensionButtonsProps {
	paneId: string;
	extensions: BrowserExtension[];
}

/** Shown from the toolbar's 480 px breakpoint; below it the puzzle menu still lists them. */
export function PinnedExtensionButtons({
	paneId,
	extensions,
}: PinnedExtensionButtonsProps) {
	const activate = useActivateBrowserExtension(paneId);
	const setPinned = useSetBrowserExtensionPinned();
	const pinned = extensions.filter((extension) => extension.pinned);
	return (
		<div
			className={cn(
				"hidden shrink-0 items-center gap-1",
				pinned.length > 0 && "@min-[480px]/browser-toolbar:flex",
			)}
		>
			{pinned.map((extension) => (
				<ExtensionToolbarButton
					key={extension.id}
					extension={extension}
					onActivate={(anchor) => activate(extension, anchor)}
					onUnpin={() => setPinned(extension, false)}
				/>
			))}
		</div>
	);
}
