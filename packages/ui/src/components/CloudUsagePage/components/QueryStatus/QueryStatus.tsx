"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "../../../ui/button";
import { Notice } from "../Notice";

interface QueryStatusProps {
	isError: boolean;
	onRetry: () => void;
}

export function QueryStatus({ isError, onRetry }: QueryStatusProps) {
	if (!isError) {
		return (
			<Notice>
				<Trans>Loading...</Trans>
			</Notice>
		);
	}
	return (
		<Notice>
			<span className="flex flex-wrap items-center justify-center gap-3">
				<Trans>Failed to load usage</Trans>
				<Button size="sm" variant="outline" onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			</span>
		</Notice>
	);
}
