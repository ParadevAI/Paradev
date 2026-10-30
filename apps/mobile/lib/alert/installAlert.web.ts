import { Alert, type AlertButton } from "react-native";
import type { InstallAlert } from "./installAlert.types";

// react-native-web's Alert.alert does nothing, so every error and every
// confirmation was silent in the browser.
export const installAlert: InstallAlert = () => {
	Alert.alert = (title, message, buttons) => {
		const text = message ? `${title}\n\n${message}` : title;
		const cancel = buttons?.find((button) => button.style === "cancel");
		const actions = (buttons ?? []).filter((button) => button !== cancel);
		if (!cancel && actions.length <= 1) {
			window.alert(text);
			actions[0]?.onPress?.();
			return;
		}
		const chosen = actions.find((action: AlertButton) =>
			window.confirm(
				actions.length === 1 ? text : `${text}\n\n${action.text ?? ""}?`,
			),
		);
		(chosen ?? cancel)?.onPress?.();
	};
};
