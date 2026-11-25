"use client";

import { useLingui } from "@lingui/react/macro";
import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { Button } from "../../../../../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../../../../ui/tooltip";

const SPIN_MS = 600;

interface PageRefreshButtonProps {
	onRefresh: () => void;
	compact?: boolean;
}

export function PageRefreshButton({
	onRefresh,
	compact = false,
}: PageRefreshButtonProps) {
	const { t } = useLingui();
	const [spinning, setSpinning] = useState(false);
	const label = t({ message: "Refresh" });

	useEffect(() => {
		if (!spinning) return;
		const timer = setTimeout(() => setSpinning(false), SPIN_MS);
		return () => clearTimeout(timer);
	}, [spinning]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={label}
					onClick={() => {
						setSpinning(true);
						onRefresh();
					}}
					className={
						compact
							? "size-6 text-muted-foreground/60 hover:text-muted-foreground"
							: undefined
					}
				>
					<RotateCw className={cn("size-3.5", spinning && "animate-spin")} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
