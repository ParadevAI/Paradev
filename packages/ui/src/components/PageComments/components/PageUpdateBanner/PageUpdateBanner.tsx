"use client";

import { Trans } from "@lingui/react/macro";
import { Sparkles } from "lucide-react";
import { Button } from "../../../ui/button";

interface PageUpdateBannerProps {
	version: number;
	onView: () => void;
}

export function PageUpdateBanner({ version, onView }: PageUpdateBannerProps) {
	return (
		<output className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover py-1 pr-1 pl-3 text-popover-foreground text-xs shadow-lg">
			<Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="whitespace-nowrap">
				<Trans>Version {version} is available</Trans>
			</span>
			<Button size="xs" onClick={onView}>
				<Trans>View</Trans>
			</Button>
		</output>
	);
}
