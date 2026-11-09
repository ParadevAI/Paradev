import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { LuTriangleAlert } from "react-icons/lu";

interface StepErrorProps {
	message: ReactNode;
	onRetry: () => void;
	fallback?: ReactNode;
}

export function StepError({ message, onRetry, fallback }: StepErrorProps) {
	return (
		<div className="flex flex-col gap-3 rounded-md border bg-muted/40 px-3.5 py-3 text-sm">
			<div className="flex items-start gap-2.5">
				<LuTriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
				<span className="select-text cursor-text text-foreground">
					{message}
				</span>
			</div>
			<div className="flex items-center justify-end gap-2">
				{fallback}
				<Button type="button" size="sm" variant="outline" onClick={onRetry}>
					<Trans>Try again</Trans>
				</Button>
			</div>
		</div>
	);
}
