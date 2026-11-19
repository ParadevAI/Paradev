import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EnvironmentPageLayout } from "./components/EnvironmentPageLayout";
import { EnvironmentView } from "./components/EnvironmentView";

export const Route = createFileRoute(
	"/_authenticated/settings/environments/$environmentId/",
)({
	component: EnvironmentSettingsPage,
});

function EnvironmentSettingsPage() {
	const { environmentId } = Route.useParams();
	const navigate = useNavigate();
	const backToList = () => navigate({ to: "/settings/environments" });

	return (
		<EnvironmentPageLayout
			backLabel={<Trans>Environments</Trans>}
			onBack={backToList}
		>
			<EnvironmentView environmentId={environmentId} onArchived={backToList} />
		</EnvironmentPageLayout>
	);
}
