import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EnvironmentPageLayout } from "../components/EnvironmentPageLayout";
import { EnvironmentSecrets } from "./components/EnvironmentSecrets";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/environments/$environmentId/variables/",
)({
	component: EnvironmentVariablesPage,
});

function EnvironmentVariablesPage() {
	const { environmentId } = Route.useParams();
	const navigate = useNavigate();
	const environment = cloudTrpc.environment.get.useQuery({ id: environmentId });
	const back = () =>
		navigate({ to: "/environments/$environmentId", params: { environmentId } });

	return (
		<EnvironmentPageLayout
			backLabel={environment.data?.name ?? " "}
			onBack={back}
		>
			<EnvironmentSecrets environmentId={environmentId} />
		</EnvironmentPageLayout>
	);
}
