import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EnvironmentView } from "renderer/routes/_authenticated/components/EnvironmentView";
import { EnvironmentPageLayout } from "./components/EnvironmentPageLayout";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/environments/$environmentId/",
)({
	component: EnvironmentPage,
});

function EnvironmentPage() {
	const { environmentId } = Route.useParams();
	const navigate = useNavigate();
	const backToSettings = () => navigate({ to: "/settings/environments" });

	return (
		<EnvironmentPageLayout
			backLabel={<Trans>Environments</Trans>}
			onBack={backToSettings}
		>
			<EnvironmentView
				environmentId={environmentId}
				onArchived={backToSettings}
			/>
		</EnvironmentPageLayout>
	);
}
