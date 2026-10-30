import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EnvironmentPageLayout } from "../components/EnvironmentPageLayout";
import { AllBuilds } from "./components/AllBuilds";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/environments/$environmentId/builds/",
)({
	component: EnvironmentBuildsPage,
});

function EnvironmentBuildsPage() {
	const { environmentId } = Route.useParams();
	const navigate = useNavigate();
	const environment = cloudTrpc.environment.get.useQuery({ id: environmentId });

	return (
		<EnvironmentPageLayout
			backLabel={environment.data?.name ?? " "}
			onBack={() =>
				navigate({
					to: "/environments/$environmentId",
					params: { environmentId },
				})
			}
		>
			<AllBuilds environmentId={environmentId} />
		</EnvironmentPageLayout>
	);
}
