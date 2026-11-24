"use client";

import { Trans } from "@lingui/react/macro";
import { LuCircleAlert } from "react-icons/lu";
import { Alert, AlertTitle } from "../../../ui/alert";
import { Button } from "../../../ui/button";
import { Skeleton } from "../../../ui/skeleton";

interface QueryStatusProps {
	isError: boolean;
	onRetry: () => void;
}

export function QueryStatus({ isError, onRetry }: QueryStatusProps) {
	if (!isError) {
		return (
			<div>
				<output className="sr-only">
					<Trans>Loading...</Trans>
				</output>
				<Skeleton aria-hidden className="h-32 w-full rounded-xl" />
			</div>
		);
	}
	return (
		<Alert variant="destructive" className="items-center">
			<LuCircleAlert />
			<AlertTitle className="flex items-center justify-between gap-4">
				<Trans>Failed to load usage</Trans>
				<Button size="sm" variant="outline" onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			</AlertTitle>
		</Alert>
	);
}
