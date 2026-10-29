import { Trans } from "@lingui/react/macro";
import { Skeleton } from "@superset/ui/skeleton";
import { HiCheck } from "react-icons/hi2";

interface EnvironmentVariablesProps {
	variables: ReadonlyArray<{ id: string; key: string }>;
	isLoading: boolean;
}

export function EnvironmentVariables({
	variables,
	isLoading,
}: EnvironmentVariablesProps) {
	return (
		<div>
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-medium">
					<Trans>Variables</Trans>
				</span>
				{!isLoading && (
					<span className="text-[11px] text-muted-foreground">
						{variables.length}
					</span>
				)}
			</div>
			{isLoading ? (
				<Skeleton className="h-16 w-full" />
			) : variables.length === 0 ? (
				<p className="rounded-lg border border-border/70 px-3 py-3 text-xs text-muted-foreground">
					<Trans>No variables set yet.</Trans>
				</p>
			) : (
				<div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70">
					{variables.map((variable) => (
						<div className="flex h-8 items-center gap-2 px-3" key={variable.id}>
							<span className="min-w-0 flex-1 truncate font-mono text-xs">
								{variable.key}
							</span>
							<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
								<HiCheck className="size-3" />
								<Trans>Set</Trans>
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
