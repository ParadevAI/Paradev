import { pageUpdateAction } from "@superset/ui/page-comments";
import { useCallback, useRef, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

type PageRef = { id: string } | { slug: string };

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
	type Pulled = Awaited<ReturnType<typeof utils.client.page.pull.query>>;
	const [offered, setOffered] = useState<Pulled | null>(null);
	const latest = useRef({ shownVersion, previewing });
	latest.current = { shownVersion, previewing };

	const apply = useCallback(
		(next: Pulled) => {
			utils.page.pull.setData(pageRef, next);
			if (pinnedVersion) {
				utils.page.pull.setData({ ...pageRef, version: pinnedVersion }, next);
				onUnpin?.();
			}
			setOffered(null);
		},
		[utils, pageRef, pinnedVersion, onUnpin],
	);

	const onPublished = useCallback(async () => {
		if (!pageId) return;
		const ref = { id: pageId };
		for (const input of [ref, { slug }]) {
			void utils.page.versions.invalidate(input);
		}
		if (latest.current.previewing) return;
		const fetched = await Promise.all([
			utils.client.page.pull.query(ref),
			utils.client.page.versions.query(ref),
		]).catch(() => null);
		if (!fetched || latest.current.previewing) return;
		const [next, versions] = fetched;
		const action = pageUpdateAction({
			shownVersion: latest.current.shownVersion ?? next.version,
			nextVersion: next.version,
			publishedBy: versions.find((row) => row.version === next.version)
				?.createdByUserId,
			viewerId,
		});
		if (action === "swap") apply(next);
		if (action === "offer") setOffered(next);
	}, [utils, pageId, slug, viewerId, apply]);

	const viewOffered = useCallback(() => {
		if (offered) apply(offered);
	}, [apply, offered]);

	return {
		onPublished,
		offeredVersion:
			offered && offered.version !== shownVersion ? offered.version : null,
		viewOffered,
	};
}
