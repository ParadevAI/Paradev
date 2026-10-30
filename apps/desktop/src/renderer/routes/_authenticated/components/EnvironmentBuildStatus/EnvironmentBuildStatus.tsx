import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuCircleCheck, LuCircleX, LuLoaderCircle } from "react-icons/lu";
import {
	BUILD_STATUS_LABELS,
	type EnvironmentBuild,
} from "renderer/routes/_authenticated/utils/environmentBuildMeta";

interface EnvironmentBuildStatusProps {
	status: EnvironmentBuild["status"];
	error?: string | null;
	className?: string;
}

export function EnvironmentBuildStatus({
	status,
	error,
	className,
}: EnvironmentBuildStatusProps) {
	const { i18n } = useLingui();
	const label = (
		<span className={cn("inline-flex items-center gap-2", className)}>
			{status === "succeeded" ? (
				<LuCircleCheck className="size-3.5 shrink-0 text-emerald-500" />
			) : status === "failed" ? (
				<LuCircleX className="size-3.5 shrink-0 text-destructive" />
			) : (
				<LuLoaderCircle className="size-3.5 shrink-0 animate-spin text-sky-500" />
			)}
			{i18n._(BUILD_STATUS_LABELS[status])}
		</span>
	);
	if (status !== "failed" || !error) return label;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="cursor-help">{label}</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-md whitespace-pre-wrap font-mono text-[11px]">
				{error}
			</TooltipContent>
		</Tooltip>
	);
}
