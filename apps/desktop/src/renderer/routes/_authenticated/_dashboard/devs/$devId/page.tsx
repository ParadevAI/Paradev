import { createFileRoute } from "@tanstack/react-router";
import {
	DEV_DETAILS_TABS,
	type DevDetailsTab,
} from "./components/DevDetailsDialog";
import { DevScreen } from "./components/DevScreen";

export type DevSearch = { details?: DevDetailsTab };

export const Route = createFileRoute("/_authenticated/_dashboard/devs/$devId/")(
	{
		component: DevPage,
		validateSearch: (search: Record<string, unknown>): DevSearch => ({
			details: DEV_DETAILS_TABS.find((tab) => tab === search.details),
		}),
	},
);

function DevPage() {
	const { devId } = Route.useParams();
	const { details } = Route.useSearch();
	return <DevScreen key={devId} devId={devId} details={details} />;
}
