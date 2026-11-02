import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EnvironmentBuildsTable } from "renderer/routes/_authenticated/components/EnvironmentBuildsTable";

const PAGE_SIZE = 20;

interface AllBuildsProps {
	environmentId: string;
}

export function AllBuilds({ environmentId }: AllBuildsProps) {
	const builds = cloudTrpc.environment.builds.useInfiniteQuery(
		{ environmentId, limit: PAGE_SIZE },
		{ getNextPageParam: (page) => page.nextCursor ?? undefined },
	);
	const rows = builds.data?.pages.flatMap((page) => page.builds) ?? [];

	return (
		<div className="flex flex-col gap-3 p-6">
			<h2 className="text-xl font-semibold">
				<Trans>Builds</Trans>
			</h2>
			<EnvironmentBuildsTable builds={rows} />
			{builds.hasNextPage && (
				<Button
					className="self-start text-muted-foreground"
					disabled={builds.isFetchingNextPage}
					onClick={() => void builds.fetchNextPage()}
					size="sm"
					variant="ghost"
				>
					<Trans>Load more</Trans>
				</Button>
			)}
		</div>
	);
}
