import { Badge } from "@superset/ui/badge";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import type { RefObject } from "react";
import { useActivateBrowserExtension } from "../../hooks/useActivateBrowserExtension";
import { ExtensionIcon } from "../ExtensionIcon";

interface PinnedExtensionRowsProps {
	paneId: string;
	extensions: BrowserExtension[];
	anchorRef: RefObject<HTMLElement | null>;
}

/** The pinned toolbar buttons as menu rows, for a toolbar below 480 px. */
export function PinnedExtensionRows({
	paneId,
	extensions,
	anchorRef,
}: PinnedExtensionRowsProps) {
	const activate = useActivateBrowserExtension(paneId);
	const pinned = extensions.filter((extension) => extension.pinned);
	if (pinned.length === 0) return null;
	return (
		<>
			{pinned.map((extension) => (
				<DropdownMenuItem
					key={extension.id}
					onSelect={() => activate(extension, anchorRef.current)}
					className="justify-between gap-2"
				>
					<span className="flex min-w-0 items-center gap-2">
						<ExtensionIcon extension={extension} className="size-4" />
						<span className="min-w-0 truncate">{extension.name}</span>
					</span>
					{extension.badge && (
						<Badge variant="outline">{extension.badge.text}</Badge>
					)}
				</DropdownMenuItem>
			))}
			<DropdownMenuSeparator />
		</>
	);
}
