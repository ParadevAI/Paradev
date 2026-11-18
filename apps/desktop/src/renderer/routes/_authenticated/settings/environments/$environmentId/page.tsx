import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EnvironmentView } from "renderer/routes/_authenticated/components/EnvironmentView";
import { EnvironmentPageLayout } from "./components/EnvironmentPageLayout";

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
