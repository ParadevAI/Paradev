import { type ReactNode, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/** GitHub's signed attachment URLs stop working after five minutes. */
const SIGNED_URL_FRESH_MS = 4 * 60_000;

interface GithubAttachmentImageProps {
	url: string;
	renderImage: (src: string, onError: () => void) => ReactNode;
	fallback: ReactNode;
}

/** A private repository's attachment, loaded through the GitHub login on this machine. */
export function GithubAttachmentImage({
	url,
	renderImage,
	fallback,
}: GithubAttachmentImageProps) {
	const signed = electronTrpc.viewerGithub.getAttachmentUrl.useQuery(
		{ url },
		{
			staleTime: SIGNED_URL_FRESH_MS,
			gcTime: SIGNED_URL_FRESH_MS,
			retry: false,
			refetchOnWindowFocus: false,
		},
	);
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	if (signed.isPending) return null;
	const signedUrl = signed.data?.url;
	if (!signedUrl || signedUrl === failedUrl) return fallback;
	return renderImage(signedUrl, () => setFailedUrl(signedUrl));
}
