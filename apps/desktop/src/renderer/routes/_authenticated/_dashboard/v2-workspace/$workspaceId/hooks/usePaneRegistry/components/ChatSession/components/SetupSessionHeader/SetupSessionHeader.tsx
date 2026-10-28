import { Trans } from "@lingui/react/macro";
import { LuContainer } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function SetupSessionHeader({
	environmentId,
}: {
	environmentId: string;
}) {
	const environment = cloudTrpc.environment.get.useQuery(
		{ id: environmentId },
		{ retry: false },
	);
	return (
		<div className="flex items-center gap-2 border-b border-border/60 px-6 py-1.5 text-xs text-muted-foreground">
			<LuContainer className="size-3.5 shrink-0" />
			<span className="text-foreground">
				<Trans>Cloud environment setup</Trans>
			</span>
			{environment.data && (
				<>
					<span aria-hidden="true" className="text-border">
						·
					</span>
					<span className="truncate">{environment.data.name}</span>
				</>
			)}
		</div>
	);
}
