import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import type { WebsitePreviewLoad } from "../../../WebsitePreviewCard";

const OPEN_TAB_CAPTURE_TIMEOUT_MS = 1_500;

type OpenTabPreview = Awaited<ReturnType<typeof captureOpenTab>>;

async function captureOpenTab(url: string) {
	const page = browserRuntimeRegistry.findOpenPage(url);
	if (!page) return null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const image = await Promise.race([
			electronTrpcClient.browser.capturePreview.mutate({ paneId: page.paneId }),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), OPEN_TAB_CAPTURE_TIMEOUT_MS);
			}),
		]);
		return image ? { title: page.title.trim() || null, image } : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * The preview for a web page. A page already open in a browser pane gives a
 * screenshot of that tab; any other page is fetched by the host.
 */
export function useWebsitePreview(
	url: string,
	{ active, workspaceId }: { active: boolean; workspaceId: string | undefined },
): WebsitePreviewLoad {
	const [openTab, setOpenTab] = useState<{
		url: string;
		preview: OpenTabPreview;
	} | null>(null);
	const openTabChecked = openTab?.url === url;
	useEffect(() => {
		if (!active) {
			// A tab can close or move on between hovers, so each hover looks again.
			setOpenTab(null);
			return;
		}
		if (openTabChecked) return;
		let cancelled = false;
		void captureOpenTab(url).then((preview) => {
			if (!cancelled) setOpenTab({ url, preview });
		});
		return () => {
			cancelled = true;
		};
	}, [active, openTabChecked, url]);
	const tabPreview = openTabChecked ? openTab.preview : null;
	const fetched = workspaceTrpc.linkPreview.get.useQuery(
		{ url, image: true },
		{
			enabled: active && Boolean(workspaceId) && openTabChecked && !tabPreview,
			staleTime: Number.POSITIVE_INFINITY,
			retry: false,
		},
	);

	if (tabPreview) {
		return {
			status: "ready",
			preview: {
				title: tabPreview.title,
				description: null,
				iconDataUrl: null,
				image: tabPreview.image,
			},
		};
	}
	if (fetched.data) {
		return {
			status: "ready",
			preview: {
				title: fetched.data.title?.trim() || null,
				// A host older than these fields leaves them out.
				description: fetched.data.description?.trim() || null,
				iconDataUrl: fetched.data.iconDataUrl,
				image: fetched.data.image ?? null,
			},
		};
	}
	return fetched.isError ? { status: "unavailable" } : { status: "loading" };
}
