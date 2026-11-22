import { type ReactNode, useState } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { getPluginIconUrl } from "renderer/components/PluginIcon";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PreviewHoverCard } from "../PreviewHoverCard";
import type { WebsitePreviewLoad } from "../WebsitePreviewCard";

const FRESH_FOR_MS = 60_000;

/** A Slack message or profile, read with the viewer's own Slack connection. */
export function SlackHoverCard({
	children,
	url,
}: {
	children: ReactNode;
	url: string;
}) {
	const isDark = useIsDarkTheme();
	const [open, setOpen] = useState(false);
	// Only an opened card asks: these calls share the Slack rate limit with the
	// agents' Slack tools, and a pointer crossing a link is not worth one.
	const query = cloudTrpc.plugins.slackLinkPreview.useQuery(
		{ url },
		{ enabled: open, staleTime: FRESH_FOR_MS, retry: false },
	);
	const data = query.data;
	const load: WebsitePreviewLoad =
		data?.status === "ready"
			? {
					status: "ready",
					preview: {
						title: data.title,
						description: data.description,
						iconDataUrl: getPluginIconUrl("slack", isDark) ?? null,
						image: null,
					},
				}
			: data || query.isError
				? { status: "unavailable" }
				: { status: "loading" };
	return (
		<PreviewHoverCard load={load} onOpenChange={setOpen} open={open} url={url}>
			{children}
		</PreviewHoverCard>
	);
}
