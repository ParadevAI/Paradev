import { DeepLinkRedirect } from "@/components/DeepLinkRedirect";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function EnvironmentDeepLinkPage({ params }: PageProps) {
	const { id } = await params;
	return <DeepLinkRedirect path={`environments/${encodeURIComponent(id)}`} />;
}
