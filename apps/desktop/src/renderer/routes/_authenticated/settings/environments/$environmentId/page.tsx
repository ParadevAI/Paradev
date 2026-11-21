import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HiArrowLeft } from "react-icons/hi2";
import { EnvironmentView } from "renderer/routes/_authenticated/components/EnvironmentView";

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
		<div className="flex w-full max-w-4xl flex-col p-6">
			<button
				className="mx-4 mb-2 flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
				onClick={backToList}
				type="button"
			>
				<HiArrowLeft className="size-4" />
				<Trans>Environments</Trans>
			</button>
			<EnvironmentView environmentId={environmentId} onArchived={backToList} />
		</div>
	);
}
