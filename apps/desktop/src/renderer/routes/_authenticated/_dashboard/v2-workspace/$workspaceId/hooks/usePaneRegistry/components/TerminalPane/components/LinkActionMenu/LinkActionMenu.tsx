import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import {
	Clipboard,
	ExternalLink,
	Globe,
	type LucideIcon,
	PanelRight,
	SquarePlus,
} from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import {
	actionLabel,
	type LinkAction,
	type LinkTier,
	type LinkTierMap,
	modifierLabel,
} from "renderer/lib/clickPolicy";
import type { LinkActionMenuRequest } from "../../hooks/useLinkActionMenu";

const ACTION_ICONS: Record<LinkAction, LucideIcon> = {
	pane: Globe,
	newTab: SquarePlus,
	external: ExternalLink,
	rightPane: PanelRight,
};

const SHORTCUT_TIERS: LinkTier[] = ["meta", "shift", "metaShift"];

function opensAs(action: LinkAction | null, hasRightPane: boolean) {
	return hasRightPane && action !== null && action !== "external"
		? "rightPane"
		: action;
}

function shortcutTier(
	map: LinkTierMap,
	action: LinkAction,
	hasRightPane: boolean,
): LinkTier | null {
	return (
		SHORTCUT_TIERS.find(
			(tier) => opensAs(map[tier], hasRightPane) === action,
		) ?? null
	);
}

const PANE_ACTIONS: LinkAction[] = ["pane", "newTab", "external"];
const RIGHT_PANE_ACTIONS: LinkAction[] = ["rightPane", "external"];

export interface LinkActionMenuProps {
	menu: LinkActionMenuRequest | null;
	hasRightPane: boolean;
	onSelect: (url: string, action: LinkAction) => void;
	onClose: () => void;
}

export function LinkActionMenu({
	menu,
	hasRightPane,
	onSelect,
	onClose,
}: LinkActionMenuProps) {
	const { t } = useLingui();
	const { preferences } = useV2UserPreferences();
	const { copyToClipboard } = useCopyToClipboard();
	if (!menu) return null;
	const actions = hasRightPane ? RIGHT_PANE_ACTIONS : PANE_ACTIONS;

	const copy = () => {
		void copyToClipboard(menu.url).then(
			() => toast.success(t({ message: "Link copied" })),
			() => toast.error(t({ message: "Couldn't copy link" })),
		);
	};

	return (
		<DropdownMenu
			key={menu.id}
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DropdownMenuTrigger asChild>
				<span
					aria-hidden
					className="pointer-events-none fixed size-0"
					style={{ left: menu.clientX, top: menu.clientY }}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				collisionPadding={8}
				className="w-max min-w-56 max-w-80"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DropdownMenuLabel
					className="line-clamp-2 break-all font-mono text-xs font-normal text-muted-foreground"
					title={menu.url}
				>
					{menu.url}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{actions.map((action) => {
					const Icon = ACTION_ICONS[action];
					const tier = shortcutTier(preferences.urlLinks, action, hasRightPane);
					return (
						<DropdownMenuItem
							key={action}
							onSelect={() => onSelect(menu.url, action)}
						>
							<Icon />
							{actionLabel(action, "url")}
							{tier && (
								<DropdownMenuShortcut className="pl-4 tracking-normal">
									{modifierLabel(tier)}
								</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
					);
				})}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={copy}>
					<Clipboard />
					<Trans>Copy link</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
