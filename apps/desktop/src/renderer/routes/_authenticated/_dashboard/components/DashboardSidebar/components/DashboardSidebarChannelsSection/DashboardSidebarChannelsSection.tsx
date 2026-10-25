import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuPlus, LuSearch } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { BrowseChannelsDialog } from "./components/BrowseChannelsDialog";
import { ChannelRow } from "./components/ChannelRow";
import { CreateChannelDialog } from "./components/CreateChannelDialog";

export function DashboardSidebarChannelsSection() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const organizationId = useActiveOrganizationId();
	const [dialog, setDialog] = useState<"create" | "browse" | null>(null);
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.channels,
	);
	const { data: channels = [] } = cloudTrpc.channel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const active = matchRoute({ to: "/channels/$channelId", fuzzy: true });
	const activeChannelId = active ? active.channelId : null;

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: "Channels" })}
				section="channels"
			>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Create a channel" })}
							onClick={(event) => {
								event.stopPropagation();
								setDialog("create");
							}}
							onKeyDown={(event) => event.stopPropagation()}
							className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<LuPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Create a channel</Trans>
					</TooltipContent>
				</Tooltip>
			</DashboardSidebarSectionHeader>
			{!isSectionCollapsed && (
				<div className="flex flex-col gap-px px-2">
					{channels.map((channel) => (
						<ChannelRow
							key={channel.id}
							name={channel.name}
							visibility={channel.visibility}
							unreadCount={channel.unreadCount}
							mentionCount={channel.mentionCount}
							isActive={channel.id === activeChannelId}
							onClick={() =>
								void navigate({
									to: "/channels/$channelId",
									params: { channelId: channel.id },
								})
							}
						/>
					))}
					<button
						type="button"
						onClick={() => setDialog("browse")}
						className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					>
						<LuSearch className="size-3.5 shrink-0" />
						<span className="flex-1 text-left">
							<Trans>Browse channels</Trans>
						</span>
					</button>
				</div>
			)}
			<CreateChannelDialog
				open={dialog === "create"}
				onOpenChange={(open) => setDialog(open ? "create" : null)}
			/>
			<BrowseChannelsDialog
				open={dialog === "browse"}
				onOpenChange={(open) => setDialog(open ? "browse" : null)}
			/>
		</div>
	);
}
