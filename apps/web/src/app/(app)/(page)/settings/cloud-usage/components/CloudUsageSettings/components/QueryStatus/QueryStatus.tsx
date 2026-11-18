"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

interface QueryStatusProps {
	isError: boolean;
	onRetry: () => void;
}

export function QueryStatus({ isError, onRetry }: QueryStatusProps) {
	if (!isError) {
		return (
			<p className="py-12 text-center text-sm text-muted-foreground">
				<Trans>Loading...</Trans>
			</p>
		);
	}
	return (
		<div className="flex flex-wrap items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
			<Trans>Could not load cloud usage.</Trans>
			<Button size="sm" variant="outline" onClick={onRetry}>
				<Trans>Retry</Trans>
			</Button>
		</div>
	);
}
