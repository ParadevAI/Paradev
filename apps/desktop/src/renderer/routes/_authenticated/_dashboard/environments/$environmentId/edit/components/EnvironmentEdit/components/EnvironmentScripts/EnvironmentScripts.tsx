import { Trans } from "@lingui/react/macro";
import { Skeleton } from "@superset/ui/skeleton";
import type { ReactNode } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

function Script({
	label,
	hint,
	commands,
}: {
	label: ReactNode;
	hint: ReactNode;
	commands: readonly string[] | null;
}) {
	return (
		<div className="space-y-1.5">
			<div className="text-sm font-medium">
				{label}{" "}
				<span className="ml-1 text-xs font-normal text-muted-foreground">
					{hint}
				</span>
			</div>
			<pre className="overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
				{commands?.length ? (
					commands.map((command, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: commands may repeat
						<div key={index}>
							<span className="mr-3 select-none text-muted-foreground/50">
								{index + 1}
							</span>
							{command}
						</div>
					))
				) : (
					<Trans>Not defined</Trans>
				)}
			</pre>
		</div>
	);
}

interface EnvironmentScriptsProps {
	environmentId: string;
}

/** Read-only: the scripts live in the repository's `.superset/config.toml`. */
export function EnvironmentScripts({ environmentId }: EnvironmentScriptsProps) {
	const config = cloudTrpc.environment.config.useQuery({ environmentId });
	if (config.isLoading) return <Skeleton className="h-24 w-full" />;
	const source = config.data?.source;
	return (
		<div className="space-y-4">
			<Script
				commands={config.data?.install ?? null}
				hint={<Trans>Runs when the environment builds</Trans>}
				label={<Trans>Install script</Trans>}
			/>
			<Script
				commands={config.data?.setup ?? null}
				hint={<Trans>Runs every time a workspace starts</Trans>}
				label={<Trans>Setup script</Trans>}
			/>
			{source && (
				<p className="text-xs text-muted-foreground">
					<Trans>
						From .superset/config.toml on {source.repository}@{source.branch}.
						Change them there.
					</Trans>
				</p>
			)}
		</div>
	);
}
