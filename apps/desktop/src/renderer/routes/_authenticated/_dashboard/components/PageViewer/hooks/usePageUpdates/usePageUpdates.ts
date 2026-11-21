import { usePageUpdateOffer } from "@superset/ui/page-comments";
import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

type PageRef = { id: string } | { slug: string };

function isPinnedPull(query: { queryKey: readonly unknown[] }): boolean {
	const options = query.queryKey[1];
	if (typeof options !== "object" || options === null) return false;
	const input = (options as { input?: { version?: unknown } }).input;
	return typeof input?.version === "number";
}

export function usePageUpdates({
	pageRef,
	pageId,
	slug,
	shownVersion,
	pinnedVersion,
	previewing,
	viewerId,
	onUnpin,
}: {
	pageRef: PageRef;
	pageId: string | undefined;
	slug: string;
	shownVersion: number | undefined;
	pinnedVersion: number | null | undefined;
	previewing: boolean;
	viewerId: string | undefined;
	onUnpin: (() => void) | undefined;
}) {
	const utils = cloudTrpc.useUtils();

	const check = useCallback(async () => {
		if (!pageId) throw new Error("The page is not resolved yet");
		const ref = { id: pageId };
		const [page, versions] = await Promise.all([
			utils.client.page.pull.query(ref),
			utils.client.page.versions.query(ref),
		]);
		return {
			version: page.version,
			publishedBy: versions.find((row) => row.version === page.version)
				?.createdByUserId,
			page,
		};
	}, [utils, pageId]);

	const apply = useCallback(
		(next: Awaited<ReturnType<typeof check>>) => {
			utils.page.pull.setData(pageRef, next.page);
			if (pinnedVersion) {
				void utils.page.pull.invalidate({ ...pageRef, version: pinnedVersion });
				onUnpin?.();
			}
		},
		[utils, pageRef, pinnedVersion, onUnpin],
	);

	const offer = usePageUpdateOffer({
		pageKey: pageId ?? slug,
		check,
		apply,
		shownVersion,
		viewerId,
		paused: previewing,
	});

	const onPublished = useCallback(() => {
		if (!pageId) return;
		for (const input of [{ id: pageId }, { slug }]) {
			void utils.page.versions.invalidate(input);
			void utils.page.pull.invalidate(input, { predicate: isPinnedPull });
		}
		void offer.onPublished();
	}, [utils, pageId, slug, offer.onPublished]);

	return {
		onPublished,
		offeredVersion: offer.offered?.version ?? null,
		viewOffered: offer.viewOffered,
	};
}
