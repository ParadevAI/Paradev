import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAnalyticsRouter } from "./analytics";
import { createAttachmentsRouter } from "./attachments";
import { createAuthRouter } from "./auth";
import { createAutoUpdateRouter } from "./auto-update";
import { createBrowserRouter } from "./browser/browser";
import { createBrowserHistoryRouter } from "./browser-history";
import { createDeviceRouter } from "./device";
import { createDictationRouter } from "./dictation";
import { createDownloadsRouter } from "./downloads";
import { createExternalRouter } from "./external";
import { createGithubStarRouter } from "./github-star";
import { createHostServiceCoordinatorRouter } from "./host-service-coordinator";
import { createKeyboardLayoutRouter } from "./keyboardLayout";
import { createMenuRouter } from "./menu";
import { createMigrationRouter } from "./migration";
import { createNotificationsRouter } from "./notifications";
import { createPaneLayoutRouter } from "./pane-layout/pane-layout";
import { createPermissionsRouter } from "./permissions";
import { createPluginsRouter } from "./plugins";
import { createPortForwardsRouter } from "./port-forwards";
import { createResourceMetricsRouter } from "./resource-metrics";
import { createRingtoneRouter } from "./ringtone";
import { createScreenshotsRouter } from "./screenshots";
import { createSettingsRouter } from "./settings";
import { createSystemRouter } from "./system";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createViewerGithubRouter } from "./viewer-github";
import { createWindowRouter } from "./window";

export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		analytics: createAnalyticsRouter(),
		attachments: createAttachmentsRouter(),
		browser: createBrowserRouter(),
		browserHistory: createBrowserHistoryRouter(),
		downloads: createDownloadsRouter(),
		screenshots: createScreenshotsRouter(),
		auth: createAuthRouter(),
		autoUpdate: createAutoUpdateRouter(),
		window: createWindowRouter(),
		viewerGithub: createViewerGithubRouter(),
		terminal: createTerminalRouter(),
		notifications: createNotificationsRouter(getWindow),
		paneLayout: createPaneLayoutRouter(),
		permissions: createPermissionsRouter(),
		plugins: createPluginsRouter(),
		portForwards: createPortForwardsRouter(),
		resourceMetrics: createResourceMetricsRouter(),
		menu: createMenuRouter(),
		external: createExternalRouter(),
		githubStar: createGithubStarRouter(),
		settings: createSettingsRouter(),
		system: createSystemRouter(),
		device: createDeviceRouter(),
		dictation: createDictationRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(getWindow),
		hostServiceCoordinator: createHostServiceCoordinatorRouter(),
		keyboardLayout: createKeyboardLayoutRouter(),
		migration: createMigrationRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
