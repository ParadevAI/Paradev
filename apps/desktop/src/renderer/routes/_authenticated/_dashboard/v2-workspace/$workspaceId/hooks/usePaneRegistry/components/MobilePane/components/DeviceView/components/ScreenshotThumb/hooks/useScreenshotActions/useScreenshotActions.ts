import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	lastActiveChatComposer,
	useChatComposerStore,
} from "../../../../../../../../stores/chatComposerStore";

export function useScreenshotActions(workspaceId: string, id: string) {
	const { t } = useLingui();
	const chat = useChatComposerStore((state) =>
		lastActiveChatComposer(state.composers, workspaceId),
	);

	const attachToChat = chat
		? async () => {
				try {
					const { filename, base64 } =
						await electronTrpcClient.screenshots.readPng.query({ id });
					const bytes = Uint8Array.from(atob(base64), (char) =>
						char.charCodeAt(0),
					);
					chat.addFiles([new File([bytes], filename, { type: "image/png" })]);
				} catch {
					toast.error(t({ message: "Couldn't attach the screenshot" }));
				}
			}
		: null;

	return {
		attachToChat,
		copy: () =>
			electronTrpcClient.screenshots.copy.mutate({ id }).then(
				() => toast.success(t({ message: "Screenshot copied" })),
				() => toast.error(t({ message: "Couldn't copy the screenshot" })),
			),
		open: () =>
			electronTrpcClient.screenshots.openFile
				.mutate({ id })
				.catch(() =>
					toast.error(t({ message: "Couldn't open the screenshot" })),
				),
		showInFolder: () =>
			electronTrpcClient.screenshots.showInFolder
				.mutate({ id })
				.catch(() =>
					toast.error(t({ message: "Couldn't open the screenshot" })),
				),
		startDrag: () =>
			electronTrpcClient.screenshots.startDrag
				.mutate({ id })
				.catch(() =>
					toast.error(t({ message: "Couldn't open the screenshot" })),
				),
	};
}
