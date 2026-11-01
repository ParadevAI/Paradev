import { dialog } from "electron";

/** A native question whose first button means yes; Escape and the default mean no. */
export async function confirm(
	window: Electron.BrowserWindow | undefined,
	options: Omit<Electron.MessageBoxOptions, "type" | "defaultId" | "cancelId">,
): Promise<boolean> {
	const box: Electron.MessageBoxOptions = {
		...options,
		type: "question",
		defaultId: 1,
		cancelId: 1,
	};
	const { response } = window
		? await dialog.showMessageBox(window, box)
		: await dialog.showMessageBox(box);
	return response === 0;
}
