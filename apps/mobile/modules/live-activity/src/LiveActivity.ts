import type { LiveActivityModule } from "./LiveActivity.types";

const LiveActivity: LiveActivityModule = {
	areActivitiesEnabled: () => false,
	activeIds: () => [],
	cacheIcon: async () => "",
	start: async () => "",
	update: async () => {},
	endAll: async () => {},
};

export default LiveActivity;
