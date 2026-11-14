import LiveActivity from "@superset/live-activity";
import type { RequestCardPermission } from "./requestCardPermission.types";

// A Live Activity needs no permission prompt.
export const requestCardPermission: RequestCardPermission = async () =>
	LiveActivity.areActivitiesEnabled();
