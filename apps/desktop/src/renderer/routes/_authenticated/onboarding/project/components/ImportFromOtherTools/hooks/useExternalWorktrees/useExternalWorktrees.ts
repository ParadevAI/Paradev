import { formatList } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { track } from "renderer/lib/analytics";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { type ExternalWorktreeSource, SOURCE_NAMES } from "../../constants";

export function useExternalWorktrees({ enabled }: { enabled: boolean }) {
	const { activeHostUrl, machineId } = useLocalHostService();
	const offeredRef = useRef(false);
	const { data } = useQuery({
		queryKey: ["external-worktrees", activeHostUrl],
		enabled: enabled && !!activeHostUrl,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: () =>
			getHostServiceClientByUrl(
				activeHostUrl as string,
			).project.detectExternalWorktrees.query(),
	});

	const offer = useMemo(() => {
		const repos = data?.repos ?? [];
		const sources = [
			...new Set<ExternalWorktreeSource>(
				repos.flatMap((repo) => repo.worktrees.map((w) => w.source)),
			),
		];
		const worktreeCount = repos.reduce(
			(count, repo) => count + repo.worktrees.length,
			0,
		);
		return {
			repos,
			sources,
			worktreeCount,
			toolNames: formatList(sources.map((source) => SOURCE_NAMES[source])),
		};
	}, [data]);

	const visible = enabled && offer.repos.length > 0 && !!machineId;

	useEffect(() => {
		if (!visible || offeredRef.current) return;
		offeredRef.current = true;
		track("external_worktrees_offered", {
			sources: offer.sources,
			repo_count: offer.repos.length,
			worktree_count: offer.worktreeCount,
		});
	}, [visible, offer]);

	return { offer, visible, machineId };
}

export type ExternalWorktreeOffer = ReturnType<
	typeof useExternalWorktrees
>["offer"];
