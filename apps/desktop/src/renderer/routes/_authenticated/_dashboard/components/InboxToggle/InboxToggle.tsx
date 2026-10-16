import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuInbox } from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";
import { useInboxBadgeCount } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxBadgeCount";
import { useInboxEnabled } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxEnabled";
import { useInboxPanelStore } from "renderer/stores/inbox-panel-state";

export function InboxToggle() {
	const { t } = useLingui();
	const isEnabled = useInboxEnabled();
	const isOpen = useInboxPanelStore((s) => s.isOpen);
	const toggleOpen = useInboxPanelStore((s) => s.toggleOpen);
	const unread = useInboxBadgeCount();

	if (!isEnabled) return null;

	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={toggleOpen}
					aria-label={t({
						message: plural(unread, {
							0: "Inbox",
							one: "Inbox, # unread",
							other: "Inbox, # unread",
						}),
					})}
					aria-pressed={isOpen}
					className={cn(
						"relative flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
						isOpen
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover",
					)}
				>
					<LuInbox className="size-3.5" strokeWidth={1.5} />
					{unread > 0 && (
						<span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[9px] font-semibold tabular-nums leading-none text-sidebar-primary-foreground">
							{unread > 99 ? "99+" : unread}
						</span>
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">
				<HotkeyLabel fallbackLabel="Inbox" id="TOGGLE_INBOX" />
			</TooltipContent>
		</Tooltip>
	);
}
