import { DeepLinkRedirect } from "@/components/DeepLinkRedirect";

interface PageProps {
	params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceDeepLinkPage({ params }: PageProps) {
	const { workspaceId } = await params;
	return (
		<DeepLinkRedirect
			path={`v2-workspace/${encodeURIComponent(workspaceId)}`}
		/>
	);
}
