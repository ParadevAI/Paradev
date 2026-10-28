import { useLingui } from "@lingui/react/macro";
import {
	buildChatExport,
	chatExportFilename,
	chatExportZip,
	readAllEnvelopes,
} from "@superset/chat/core";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";

const READ_ALL_PAGE = 500;
const BASE64_CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
		binary += String.fromCharCode(
			...bytes.subarray(start, start + BASE64_CHUNK),
		);
	}
	return btoa(binary);
}

export function useChatActions(workspaceId: string) {
	const { t } = useLingui();
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const queryClient = useQueryClient();
	const { mutateAsync: renameSession } =
		workspaceTrpc.sessions.rename.useMutation();

	const renameChat = useCallback(
		async (sessionId: string, title: string | null): Promise<boolean> => {
			try {
				await renameSession({
					workspaceId,
					sessionId,
					...(title ? { title } : {}),
				});
				void queryClient.invalidateQueries({
					queryKey: ["chat-v3", hostUrl, "history", workspaceId],
				});
				return true;
			} catch (error) {
				console.error("[acp-chat] rename failed", error);
				toast.error(t({ message: "Could not rename chat" }), {
					description: isMissingProcedureError(error)
						? t({ message: "Update this host to rename chats." })
						: errorMessage(error, t({ message: "Unknown error" })),
				});
				return false;
			}
		},
		[renameSession, workspaceId, queryClient, hostUrl, t],
	);

	const exportChat = useCallback(
		async (sessionId: string): Promise<void> => {
			try {
				const { session } = await transport.getSession({ sessionId });
				if (!session) throw new Error(`chat session ${sessionId} not found`);
				const envelopes = await readAllEnvelopes((before) =>
					transport.getItems({
						sessionId,
						limit: READ_ALL_PAGE,
						...(before ? { before } : {}),
					}),
				);
				const now = new Date();
				const exported = buildChatExport(session, envelopes, now);
				const saved = await electronTrpcClient.window.saveChatExport.mutate({
					filename: chatExportFilename(exported.chat.title, now),
					base64: bytesToBase64(chatExportZip(exported)),
				});
				if (!saved.canceled) toast.success(t({ message: "Chat exported" }));
			} catch (error) {
				console.error("[acp-chat] export failed", error);
				toast.error(t({ message: "Could not export chat" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			}
		},
		[transport, t],
	);

	return { renameChat, exportChat };
}
