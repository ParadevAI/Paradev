"use client";

import { pagePresenceUrl } from "@superset/shared/page-presence";
import { pageStorageSocketUrl } from "@superset/shared/page-storage-ticket";
import {
	PageCommentsView,
	type PageToolHost,
	PageUpdateBanner,
	pageUpdateAction,
} from "@superset/ui/page-comments";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
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
	const [offered, setOffered] = useState<number | null>(null);
	const onPublished = useCallback(async () => {
		const fetched = await Promise.all([
			queryClient.fetchQuery({
				...trpc.page.pull.queryOptions({ id: pageId }),
				staleTime: 0,
			}),
			queryClient.fetchQuery({
				...trpc.page.versions.queryOptions({ id: pageId }),
				staleTime: 0,
			}),
		]).catch(() => null);
		if (!fetched) return;
		const [next, versions] = fetched;
		const action = pageUpdateAction({
			shownVersion: version,
			nextVersion: next.version,
			publishedBy: versions.find((row) => row.version === next.version)
				?.createdByUserId,
			viewerId,
		});
		if (action === "swap") router.refresh();
		if (action === "offer") setOffered(next.version);
	}, [queryClient, trpc, pageId, version, viewerId, router]);
	const viewOffered = useCallback(() => {
		setOffered(null);
		router.refresh();
	}, [router]);

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
			{offered !== null && offered !== version && !previewing ? (
				<PageUpdateBanner version={offered} onView={viewOffered} />
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
