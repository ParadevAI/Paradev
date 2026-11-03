import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CustomizeDevDialog } from "renderer/routes/_authenticated/_dashboard/components/CustomizeDevDialog";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DevContextMenu } from "./components/DevContextMenu";
import { DevRow } from "./components/DevRow";

export function DashboardSidebarDevsSection() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const organizationId = useActiveOrganizationId();
	const [isCreating, setCreating] = useState(false);
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.devs,
	);
	const { data: devs = [] } = cloudTrpc.agent.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const active = matchRoute({ to: "/devs/$devId", fuzzy: true });
	const activeDevId = active ? active.devId : null;

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: "Devs" })}
				section="devs"
			>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Create a Dev" })}
							onClick={(event) => {
								event.stopPropagation();
								setCreating(true);
							}}
							onKeyDown={(event) => event.stopPropagation()}
							className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<LuPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Create a Dev</Trans>
					</TooltipContent>
				</Tooltip>
			</DashboardSidebarSectionHeader>
			{!isSectionCollapsed && (
				<div className="flex flex-col gap-px px-2">
					{devs.map((dev) => (
						<DevContextMenu
							key={dev.id}
							dev={dev}
							isActive={dev.id === activeDevId}
						>
							<DevRow
								dev={dev}
								isActive={dev.id === activeDevId}
								onClick={() =>
									void navigate({
										to: "/devs/$devId",
										params: { devId: dev.id },
									})
								}
							/>
						</DevContextMenu>
					))}
				</div>
			)}
			<CustomizeDevDialog open={isCreating} onOpenChange={setCreating} />
		</div>
	);
}
