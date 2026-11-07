import { createFileRoute } from "@tanstack/react-router";
import { DevScreen } from "./components/DevScreen";

export const Route = createFileRoute("/_authenticated/_dashboard/devs/$devId/")(
	{ component: DevPage },
);

function DevPage() {
	const { devId } = Route.useParams();
	return <DevScreen key={devId} devId={devId} />;
}
