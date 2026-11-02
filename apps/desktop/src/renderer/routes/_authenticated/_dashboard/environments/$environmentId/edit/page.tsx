import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { z } from "zod";
import { EnvironmentPageLayout } from "../components/EnvironmentPageLayout";
import { EnvironmentEdit } from "./components/EnvironmentEdit";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/environments/$environmentId/edit/",
)({
	component: EnvironmentEditPage,
	validateSearch: z.object({ focus: z.literal("name").optional() }),
});

function EnvironmentEditPage() {
	const { environmentId } = Route.useParams();
	const { focus } = Route.useSearch();
	const navigate = useNavigate();
	const environment = cloudTrpc.environment.get.useQuery({ id: environmentId });
	const back = () =>
		navigate({ to: "/environments/$environmentId", params: { environmentId } });

	return (
		<EnvironmentPageLayout
			backLabel={environment.data?.name ?? " "}
			onBack={back}
		>
			<EnvironmentEdit
				environmentId={environmentId}
				focusName={focus === "name"}
				onArchived={() => navigate({ to: "/settings/environments" })}
			/>
		</EnvironmentPageLayout>
	);
}
