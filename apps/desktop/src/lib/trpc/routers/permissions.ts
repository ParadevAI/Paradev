import { requestAppleEventsAccess } from "main/lib/apple-events-permission";
import { requestLocalNetworkAccess } from "main/lib/local-network-permission";
import { registerWithMacOSNotificationCenter } from "main/lib/notification-center-registration";
import { publicProcedure, router } from "..";
import {
	getPermissionStatus,
	requestAccessibility,
	requestAppleEvents,
	requestFullDiskAccess,
	requestLocalNetwork,
	requestMicrophone,
} from "./permissions/native-permissions";

export const createPermissionsRouter = () => {
	return router({
		getStatus: publicProcedure.query(() => {
			return getPermissionStatus();
		}),

		requestFullDiskAccess: publicProcedure.mutation(async () => {
			await requestFullDiskAccess();
		}),

		requestAccessibility: publicProcedure.mutation(async () => {
			await requestAccessibility();
		}),

		requestMicrophone: publicProcedure.mutation(async () => {
			return requestMicrophone();
		}),

		requestAppleEvents: publicProcedure.mutation(async () => {
			await requestAppleEvents();
		}),

		requestPostOnboardingAccess: publicProcedure.mutation(() => {
			registerWithMacOSNotificationCenter();
			requestAppleEventsAccess();
			requestLocalNetworkAccess();
		}),

		requestLocalNetwork: publicProcedure.mutation(async () => {
			await requestLocalNetwork();
		}),
	});
};

export type PermissionsRouter = ReturnType<typeof createPermissionsRouter>;
