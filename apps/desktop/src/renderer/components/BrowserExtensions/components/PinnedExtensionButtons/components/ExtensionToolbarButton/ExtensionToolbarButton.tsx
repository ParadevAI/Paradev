import { Trans } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { CountBadge } from "@superset/ui/count-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { TbPinnedOff } from "react-icons/tb";
import { ExtensionIcon } from "../../../ExtensionIcon";
import { badgeTextTone } from "./utils/badgeTextTone";

interface ExtensionToolbarButtonProps {
	extension: BrowserExtension;
	onActivate: (anchor: HTMLElement) => void;
	onUnpin: () => void;
}

export function ExtensionToolbarButton({
	extension,
	onActivate,
	onUnpin,
}: ExtensionToolbarButtonProps) {
	const { badge, popupOpen } = extension;
	const color = badge?.color?.[3] ? badge.color : null;
	return (
		<ContextMenu>
			<Tooltip disableHoverableContent>
				<TooltipTrigger asChild>
					<ContextMenuTrigger asChild>
						<button
							type="button"
							aria-label={
								badge ? `${extension.title} (${badge.text})` : extension.title
							}
							aria-expanded={popupOpen}
							onClick={(event) => onActivate(event.currentTarget)}
							className={cn(
								"shrink-0 rounded-md p-1 transition-colors",
								popupOpen
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground",
							)}
						>
							<span className="relative block size-3.5">
								<ExtensionIcon extension={extension} className="size-3.5" />
								{badge && (
									<CountBadge
										aria-hidden="true"
										style={
											color
												? {
														// Opaque, so the text tone is picked against what is drawn.
														backgroundColor: `rgb(${color[0]} ${color[1]} ${color[2]})`,
													}
												: undefined
										}
										className={cn(
											popupOpen
												? "ring-accent"
												: "ring-[color-mix(in_oklab,var(--muted)_30%,var(--background))]",
											color &&
												(badgeTextTone(color) === "light"
													? "text-white"
													: "text-black"),
										)}
									>
										{badge.text}
									</CountBadge>
								)}
							</span>
						</button>
					</ContextMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">{extension.title}</TooltipContent>
			</Tooltip>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onUnpin}>
					<TbPinnedOff className="size-4" />
					<Trans>Unpin</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
