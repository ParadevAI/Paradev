import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { LuCpu } from "react-icons/lu";
import { useBoxResources } from "renderer/hooks/host-service/useBoxResources";
import { MachineSizeMenuItems } from "renderer/routes/_authenticated/_dashboard/components/MachineSizeMenuItems";
import { useChangeMachineSize } from "renderer/routes/_authenticated/hooks/useChangeMachineSize";
import { useBoxPressure } from "renderer/stores/box-pressure";
import { ResourceMeter } from "./components/ResourceMeter";

const MB_PER_GB = 1024;

export function BoxResourcesSection({ workspaceId }: { workspaceId: string }) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const pressure = useBoxPressure(workspaceId);
	const [openByUser, setOpenByUser] = useState<boolean | null>(null);
	const open = openByUser ?? pressure !== null;
	const resources = useBoxResources(workspaceId, { enabled: open });
	const { currentSize, currentOption } = useChangeMachineSize(workspaceId);

	const level = pressure?.level ?? null;
	const cpuLimited = pressure?.limitedBy.includes("cpu") ?? false;
	const memoryLimited = pressure?.limitedBy.includes("memory") ?? false;
	const gb = (mb: number) =>
		formatNumber(mb / MB_PER_GB, { maximumFractionDigits: 1 });

	const status =
		level === "critical"
			? t({ message: "Out of memory", context: "machine pressure" })
			: level === "busy"
				? memoryLimited
					? t({ message: "Memory-bound", context: "machine pressure" })
					: t({ message: "CPU-bound", context: "machine pressure" })
				: null;

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpenByUser}
			className="pt-2 border-t border-border"
		>
			<CollapsibleTrigger className="group/machine flex w-full items-center gap-1.5 text-left text-xs">
				<LuCpu className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate">
					{currentOption
						? status
							? currentOption.name
							: `${currentOption.name} · ${currentOption.spec}`
						: currentSize}
				</span>
				{status ? (
					<span
						className={cn(
							"shrink-0 font-medium",
							level === "critical" ? "text-destructive" : "text-amber-500",
						)}
					>
						{status}
					</span>
				) : null}
				<HiChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/machine:rotate-90" />
			</CollapsibleTrigger>
			<CollapsibleContent className="space-y-2.5 pt-2.5">
				{resources ? (
					<>
						<ResourceMeter
							label={t({
								message: `CPU · ${formatNumber(resources.vcpus)} vCPU`,
							})}
							value={t({
								message: `Waiting ${formatNumber(Math.round(resources.cpuWaitingPercent))}% of the last minute`,
							})}
							percent={resources.cpuWaitingPercent}
							tone={cpuLimited ? "warning" : "neutral"}
						/>
						<ResourceMeter
							label={t({ message: "Memory" })}
							value={t({
								message: `${gb(resources.memoryUsedMb)} of ${gb(resources.memoryLimitMb)} GB`,
							})}
							percent={(resources.memoryUsedMb / resources.memoryLimitMb) * 100}
							tone={
								level === "critical"
									? "critical"
									: memoryLimited
										? "warning"
										: "neutral"
							}
						/>
					</>
				) : null}
				{pressure?.reap ? (
					<p className="text-xs text-destructive">
						{t({
							message: `Stopped ${pressure.reap.processName} (${gb(pressure.reap.rssMb)} GB) to free memory`,
						})}
					</p>
				) : null}
				<DropdownMenu>
					<DropdownMenuTrigger className="text-xs font-medium underline underline-offset-4 hover:text-foreground">
						{t({ message: "Change machine size" })}
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="min-w-64">
						<MachineSizeMenuItems workspaceId={workspaceId} menu="dropdown" />
					</DropdownMenuContent>
				</DropdownMenu>
			</CollapsibleContent>
		</Collapsible>
	);
}
