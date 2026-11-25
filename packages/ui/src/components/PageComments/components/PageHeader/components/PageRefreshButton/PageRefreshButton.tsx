"use client";

import { useLingui } from "@lingui/react/macro";
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { Button } from "../../../../../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../../../../ui/tooltip";

interface PageRefreshButtonProps {
	onRefresh: () => void | Promise<void>;
	compact?: boolean;
}

export function PageRefreshButton({
	onRefresh,
	compact = false,
}: PageRefreshButtonProps) {
	const { t } = useLingui();
	const [refreshing, setRefreshing] = useState(false);
	const label = t({ message: "Refresh" });

	const refresh = async () => {
		setRefreshing(true);
		try {
			await onRefresh();
		} finally {
			setRefreshing(false);
		}
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={label}
					aria-busy={refreshing}
					onClick={() => void refresh()}
					className={
						compact
							? "size-6 text-muted-foreground/60 hover:text-muted-foreground"
							: undefined
					}
				>
					<RotateCw className={cn("size-3.5", refreshing && "animate-spin")} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
