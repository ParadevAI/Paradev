import { AUTO_UPDATE_STATUS } from "shared/auto-update";

export type UpdatePhase =
	| "downloading"
	| "ready"
	| "installing"
	| "error"
	| "updated";

export function resolvePhase(
	status: string | undefined,
	isInstalling: boolean,
	confirmationDone: boolean,
): UpdatePhase | null {
	switch (status) {
		case AUTO_UPDATE_STATUS.DOWNLOADING:
			return "downloading";
		case AUTO_UPDATE_STATUS.READY:
			return isInstalling ? "installing" : "ready";
		case AUTO_UPDATE_STATUS.ERROR:
			return "error";
		case AUTO_UPDATE_STATUS.UPDATED:
			return confirmationDone ? null : "updated";
		default:
			return null;
	}
}
