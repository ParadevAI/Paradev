import { createFileRoute } from "@tanstack/react-router";
import { Redirect } from "renderer/components/Redirect";
import { usePagesEnabled } from "renderer/hooks/usePagesEnabled";
import { PageDetailView } from "./components/PageDetailView";

export const Route = createFileRoute("/_authenticated/_dashboard/pages/$slug/")(
	{
		component: PageDetailPage,
		validateSearch: (
			search: Record<string, unknown>,
		): { comments?: boolean; thread?: string } => ({
			comments: search.comments === true || undefined,
			thread: typeof search.thread === "string" ? search.thread : undefined,
		}),
	},
);

function PageDetailPage() {
	const { slug } = Route.useParams();
	const isEnabled = usePagesEnabled();
	const { comments, thread } = Route.useSearch();

	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;

	return (
		<PageDetailView
			key={slug}
			slug={slug}
			initialThreadId={thread ?? null}
			initialPanelOpen={Boolean(comments) || thread !== undefined}
		/>
	);
}
