import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HiArrowLeft } from "react-icons/hi2";
import { EnvironmentView } from "renderer/routes/_authenticated/components/EnvironmentView";

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
		<div className="flex h-full w-full flex-col overflow-hidden bg-background">
			<div className="flex h-12 shrink-0 items-center px-4">
				<button
					className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					onClick={backToSettings}
					type="button"
				>
					<HiArrowLeft className="size-4" />
					<Trans>Environments</Trans>
				</button>
			</div>
			<div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
				<EnvironmentView
					environmentId={environmentId}
					onArchived={backToSettings}
				/>
			</div>
		</div>
	);
}
