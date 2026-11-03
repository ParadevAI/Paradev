import { DeepLinkRedirect } from "@/components/DeepLinkRedirect";

interface PageProps {
	params: Promise<{ workspaceId: string }>;
	searchParams: Promise<{ sessionId?: string | string[] }>;
}

export default async function WorkspaceDeepLinkPage({
	params,
	searchParams,
}: PageProps) {
	const { workspaceId } = await params;
	const { sessionId } = await searchParams;
	const path = `v2-workspace/${encodeURIComponent(workspaceId)}`;
	if (typeof sessionId !== "string" || !sessionId) {
		return <DeepLinkRedirect path={path} />;
	}
	const search = new URLSearchParams({
		sessionId,
		focusRequestId: crypto.randomUUID(),
	});
	return <DeepLinkRedirect path={`${path}?${search}`} />;
}
