import { env } from "../env";

export const posthogConfig = {
	apiKey: env.EXPO_PUBLIC_POSTHOG_KEY,
	host: env.EXPO_PUBLIC_POSTHOG_HOST,
	options: {
		enableSessionReplay: true,
		sessionReplayConfig: {
			screenshotModeBackgroundCapture: true,
		},
		debug: env.NODE_ENV === "development",
	},
};
