import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import type { EvidencePage } from "../../components/PullRequestEvidence/components/EvidencePageCard";

const MAX_LINKED_PAGES = 12;
const findPageLinks = pageLinkFinder(env.NEXT_PUBLIC_WEB_URL);

/** The pages a pull request links in its description, in the order it names them. */
export function usePullRequestEvidence(
	body: string | null | undefined,
	enabled: boolean,
) {
	const slugs = useMemo(
		() =>
			findPageLinks(body ?? "")
				.slice(0, MAX_LINKED_PAGES)
				.map((link) => link.slug),
		[body],
	);
	const previews = cloudTrpc.useQueries((t) =>
		slugs.map((slug) =>
			t.page.preview(
				{ slug },
				{ enabled, refetchInterval: 30_000, refetchOnWindowFocus: true },
			),
		),
	);

	const pages: EvidencePage[] = [];
	for (const preview of previews) {
		if (preview.data?.status !== "readable") continue;
		const { id, slug, title, thumbnailUrl } = preview.data.preview;
		pages.push({ id, slug, title, thumbnailUrl });
	}
	const isPending = previews.some((preview) => preview.isPending);

	return {
		hasLinks: slugs.length > 0,
		pages,
		totalCount: isPending ? undefined : pages.length,
		isPending,
		isError: previews.some((preview) => preview.isError),
		onRetry: () => {
			for (const preview of previews) {
				if (preview.isError) void preview.refetch();
			}
		},
	};
}
