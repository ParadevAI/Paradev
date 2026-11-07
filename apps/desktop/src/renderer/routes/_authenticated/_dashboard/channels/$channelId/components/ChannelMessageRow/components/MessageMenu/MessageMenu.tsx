import { useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Fragment, type ReactNode, useState } from "react";
import { LuExternalLink, LuLink } from "react-icons/lu";
import type { MessageMenuItem } from "../../hooks/useMessageMenuItems";

interface MessageMenuProps {
	menu: MessageMenuItem[][];
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}

/** Right-click on a message: the link under the pointer first, then the More actions items. */
export function MessageMenu({
	menu,
	onOpenChange,
	children,
}: MessageMenuProps) {
	const { t } = useLingui();
	const [link, setLink] = useState<string | null>(null);
	return (
		<ContextMenu onOpenChange={onOpenChange}>
			<ContextMenuTrigger
				asChild
				onContextMenu={(event) => {
					const anchor = (event.target as Element).closest("a[href]");
					const href = anchor?.getAttribute("href") ?? null;
					setLink(href && /^https?:\/\//.test(href) ? href : null);
				}}
			>
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				{link && (
					<>
						<ContextMenuItem onSelect={() => window.open(link, "_blank")}>
							<LuExternalLink className="size-4" />
							{t({ message: "Open link" })}
						</ContextMenuItem>
						<ContextMenuItem
							onSelect={() => void navigator.clipboard.writeText(link)}
						>
							<LuLink className="size-4" />
							{t({ message: "Copy link address" })}
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
				{menu.map((group, index) => (
					<Fragment key={group[0]?.id}>
						{index > 0 && <ContextMenuSeparator />}
						{group.map((item) => (
							<ContextMenuItem
								key={item.id}
								variant={item.destructive ? "destructive" : "default"}
								onSelect={item.run}
							>
								<item.icon className="size-4" />
								{item.label}
							</ContextMenuItem>
						))}
					</Fragment>
				))}
			</ContextMenuContent>
		</ContextMenu>
	);
}
