import { useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { type ReactNode, useState } from "react";
import { LuExternalLink, LuLink } from "react-icons/lu";
import { useMessageMenuItems } from "../../hooks/useMessageMenuItems";

interface MessageMenuProps {
	text: string;
	permalink: string | null;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}

/** Right-click on a message: a link under the pointer, then the same items as More actions, as Slack's desktop app does. */
export function MessageMenu({
	text,
	permalink,
	onOpenChange,
	children,
}: MessageMenuProps) {
	const { t } = useLingui();
	const [link, setLink] = useState<string | null>(null);
	const items = useMessageMenuItems({ text, permalink });
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
			<ContextMenuContent
				className="w-56"
				onKeyDown={(event) => {
					const item = items.find((i) => i.key?.matches(event.nativeEvent));
					if (!item) return;
					event.preventDefault();
					item.run();
				}}
			>
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
						{items.length > 0 && <ContextMenuSeparator />}
					</>
				)}
				{items.map((item) => (
					<ContextMenuItem key={item.id} onSelect={item.run}>
						<item.icon className="size-4" />
						{item.label}
						{item.key && (
							<ContextMenuShortcut>{item.key.display}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				))}
			</ContextMenuContent>
		</ContextMenu>
	);
}
