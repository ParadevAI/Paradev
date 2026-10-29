import { Trans } from "@lingui/react/macro";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function EnvironmentLinkLabel({
	environmentId,
}: {
	environmentId: string;
}) {
	const environment = cloudTrpc.environment.get.useQuery(
		{ id: environmentId },
		{ retry: false },
	);
	return environment.data?.name ?? <Trans>Environment</Trans>;
}
