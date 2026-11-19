"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "../../../ui/button";
import {
	Empty,
	EmptyContent,
	EmptyHeader,
	EmptyTitle,
} from "../../../ui/empty";
import { Skeleton } from "../../../ui/skeleton";

interface QueryStatusProps {
	isError: boolean;
	onRetry: () => void;
}

export function QueryStatus({ isError, onRetry }: QueryStatusProps) {
	if (!isError) {
		return (
			<div className="space-y-2" aria-busy>
				<Skeleton className="h-6 w-1/3" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		);
	}
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>
					<Trans>Failed to load usage</Trans>
				</EmptyTitle>
			</EmptyHeader>
			<EmptyContent>
				<Button size="sm" variant="outline" onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			</EmptyContent>
		</Empty>
	);
}
