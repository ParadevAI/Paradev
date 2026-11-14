import { Alert } from "react-native";
import { enqueueAlert } from "./alertQueue";
import type { InstallAlert } from "./installAlert.types";

// react-native-web's Alert.alert does nothing, so every error and every
// confirmation was silent in the browser.
export const installAlert: InstallAlert = () => {
	Alert.alert = (title, message, buttons, options) =>
		enqueueAlert({
			title: title ?? "",
			message: message ?? undefined,
			buttons: buttons ?? [],
			options,
		});
};
