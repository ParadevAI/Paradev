"use client";

import { pagePresenceUrl } from "@superset/shared/page-presence";
import { pageStorageSocketUrl } from "@superset/shared/page-storage-ticket";
import {
	PageCommentsView,
	type PageToolHost,
} from "@superset/ui/page-comments";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";
import { getAuthToken } from "../../../../../trpc/auth-token";

export function PageCommentsFrame({
	pageId,
	src,
	title,
	previewing = false,
}: {
	pageId: string;
	src: string;
	title: string;
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

	const trpc = useTRPC();
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
		<PageCommentsView
			pageId={pageId}
			src={src}
			title={title}
			{...(previewing ? {} : { storageTicket, presenceUrl, toolHost })}
		/>
	);
}
