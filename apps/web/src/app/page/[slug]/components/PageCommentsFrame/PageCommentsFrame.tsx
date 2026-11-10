"use client";

import { pagePresenceUrl } from "@superset/shared/page-presence";
import { pageStorageSocketUrl } from "@superset/shared/page-storage-ticket";
import {
	PageCommentsView,
	type PageToolHost,
	PageUpdateBanner,
	usePageUpdateOffer,
} from "@superset/ui/page-comments";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";
import { getAuthToken } from "../../../../../trpc/auth-token";

export function PageCommentsFrame({
	pageId,
	src,
	title,
	version,
	viewerId,
	previewing = false,
}: {
	pageId: string;
	src: string;
	title: string;
	version: number;
	viewerId: string;
	previewing?: boolean;
}) {
	const storageTicket = useCallback(
		() =>
			pageStorageSocketUrl({
				pageId,
				realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
				token: () => getAuthToken().catch(() => null),
			}),
		[pageId],
	);

	const presenceUrl = useCallback(async () => {
		const token = await getAuthToken().catch(() => null);
		return token
			? pagePresenceUrl({
					realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
					pageId,
					token,
				})
			: null;
	}, [pageId]);

	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { onPublished, offered, viewOffered } = usePageUpdateOffer({
		pageKey: pageId,
		check: async () => {
			const [page, versions] = await Promise.all([
				queryClient.fetchQuery({
					...trpc.page.pull.queryOptions({ id: pageId }),
					staleTime: 0,
				}),
				queryClient.fetchQuery({
					...trpc.page.versions.queryOptions({ id: pageId }),
					staleTime: 0,
				}),
			]);
			return {
				version: page.version,
				publishedBy: versions.find((row) => row.version === page.version)
					?.createdByUserId,
			};
		},
		apply: () => {
			const url = new URL(window.location.href);
			if (!url.searchParams.has("v")) {
				router.refresh();
				return;
			}
			url.searchParams.delete("v");
			router.replace(`${url.pathname}${url.search}`);
		},
		shownVersion: version,
		viewerId,
	});

	const callTool = useMutation(trpc.page.callTool.mutationOptions());
	const grantTool = useMutation(trpc.page.grantTool.mutationOptions());
	const install = useMutation(trpc.plugins.install.mutationOptions());
	const toolHost = useMemo<PageToolHost>(
		() => ({
			callTool: (request) => callTool.mutateAsync({ pageId, ...request }),
			grant: async (input) => {
				await grantTool.mutateAsync({ pageId, ...input });
			},
			install: async (plugin) => {
				await install.mutateAsync({ name: plugin });
			},
			openUrl: (url) => {
				window.open(url, "_blank", "noopener,noreferrer");
			},
		}),
		[pageId, callTool.mutateAsync, grantTool.mutateAsync, install.mutateAsync],
	);

	return (
		<div className="relative h-full">
			{offered && !previewing ? (
				<PageUpdateBanner version={offered.version} onView={viewOffered} />
			) : null}
			<PageCommentsView
				pageId={pageId}
				src={src}
				title={title}
				{...(previewing
					? {}
					: { storageTicket, presenceUrl, onPublished, toolHost })}
			/>
		</div>
	);
}
