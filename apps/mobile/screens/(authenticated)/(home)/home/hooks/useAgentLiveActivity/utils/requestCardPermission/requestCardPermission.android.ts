import AsyncStorage from "@react-native-async-storage/async-storage";
import LiveActivity from "@superset/live-activity";
import { PermissionsAndroid, Platform } from "react-native";
import { askOnce } from "./askOnce";
import type { RequestCardPermission } from "./requestCardPermission.types";

const ASKED_KEY = "agent-card-notification-permission-asked";

export const requestCardPermission: RequestCardPermission = () =>
	askOnce({
		isAllowed: () => LiveActivity.areActivitiesEnabled(),
		wasAsked: async () => (await AsyncStorage.getItem(ASKED_KEY)) !== null,
		markAsked: () => AsyncStorage.setItem(ASKED_KEY, "1"),
		// Below Android 13 notifications need no runtime permission.
		ask: async () => {
			if (Number(Platform.Version) < 33) return;
			await PermissionsAndroid.request(
				PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
			);
		},
	});
