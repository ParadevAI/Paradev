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
	const browserHref = process.env.AGENTS_ENABLED
		? `/agents/workspace/${encodeURIComponent(workspaceId)}`
		: undefined;
	if (typeof sessionId !== "string" || !sessionId) {
		return <DeepLinkRedirect path={path} browserHref={browserHref} />;
	}
	const search = new URLSearchParams({
		sessionId,
		focusRequestId: crypto.randomUUID(),
	});
	return (
		<DeepLinkRedirect path={`${path}?${search}`} browserHref={browserHref} />
	);
}
