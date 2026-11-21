"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { pagePresenceUrl } from "@superset/shared/page-presence";
import { Button } from "@superset/ui/button";
import {
	PageFrame,
	PageUpdateBanner,
	usePageToolsUnavailable,
	usePageUpdateOffer,
} from "@superset/ui/page-comments";
import { PagePresenceStack, useJoinPresence } from "@superset/ui/presence";
import { useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";
import { OpenInSupersetButton } from "../OpenInSupersetButton";
import { ReportPageDialog } from "./components/ReportPageDialog";
import { guestId } from "./utils/guestId";

interface PublicPageViewProps {
	pageId: string;
	title: string;
	viewUrl: string;
	version: number;
	slug: string;
	signedIn: boolean;
}

export function PublicPageView({
	pageId,
	title,
	viewUrl,
	version,
	slug,
	signedIn,
}: PublicPageViewProps) {
	const { t } = useLingui();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { onPublished, offered, viewOffered } = usePageUpdateOffer({
		pageKey: pageId,
		check: async () => {
			const shared = await queryClient.fetchQuery({
				...trpc.page.publicView.queryOptions({ slug }),
				staleTime: 0,
			});
			return { version: shared?.version ?? version, publishedBy: null };
		},
		apply: () => router.refresh(),
		shownVersion: version,
		viewerId: null,
	});
	const frameRef = useRef<HTMLIFrameElement>(null);
	const frameOrigin = useMemo(() => new URL(viewUrl).origin, [viewUrl]);
	usePageToolsUnavailable({ frameRef, frameOrigin, signedIn });
	useJoinPresence({
		roomId: pageId,
		url: async () =>
			pagePresenceUrl({
				realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
				pageId,
				guestId: guestId(),
			}),
		onPublished,
	});

	return (
		<div className="flex h-dvh flex-col bg-background">
			<div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
				<Globe
					className="size-3.5 shrink-0 text-muted-foreground"
					aria-label={t({ message: "Shared with everyone" })}
				/>
				<span className="min-w-0 truncate font-medium text-sm">{title}</span>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<PagePresenceStack pageId={pageId} viewerId={undefined} />
					<ReportPageDialog slug={slug} signedIn={signedIn} />
					{signedIn ? (
						<OpenInSupersetButton slug={slug} />
					) : (
						<Button asChild size="xs">
							<Link
								href={{
									pathname: "/sign-in",
									query: { redirect: `/page/${slug}` },
								}}
							>
								<Trans>Sign in</Trans>
							</Link>
						</Button>
					)}
				</div>
			</div>

			<main className="relative min-h-0 flex-1">
				{offered ? (
					<PageUpdateBanner version={offered.version} onView={viewOffered} />
				) : null}
				<PageFrame ref={frameRef} src={viewUrl} title={title} />
			</main>

			<footer className="shrink-0 border-t px-3 py-1.5 text-center text-[11px] text-muted-foreground">
				<Trans>
					This page was published by a Paradev user. Its contents are
					unverified.
				</Trans>
			</footer>
		</div>
	);
}
