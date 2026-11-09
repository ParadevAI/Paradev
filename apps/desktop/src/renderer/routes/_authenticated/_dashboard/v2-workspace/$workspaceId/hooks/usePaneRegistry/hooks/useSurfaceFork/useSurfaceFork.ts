import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset, acpStartModes } from "@superset/chat/core";
import { errorMessage } from "@superset/i18n/errors";
import type { RendererContext } from "@superset/panes";
import { hostRemembersChatSelections } from "@superset/shared/host-version";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useCallback } from "react";
import { useHostServiceInfo } from "renderer/hooks/host-service/useHostServiceInfo";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import { ignoreChatTerminal } from "../../../../utils/closedChatSessions";
import type { CreateNewAgentSession } from "../../../useAgentSessionLauncher";
import { useChatWiring } from "../../components/ChatSession/hooks/useSessionClient";
import { readSavedChatMode } from "../../utils/savedChatMode";

export type SurfaceForkSource =
	| { into: "chat"; presetId: string; harnessSessionId: string }
	| { into: "cli"; configId: string; harnessSessionId: string };

export type ForkIntoOtherSurface = (
	ctx: RendererContext<PaneViewerData>,
	source: SurfaceForkSource,
) => Promise<void>;

type ChatFork =
	| { status: "forked"; sessionId: string }
	| { status: "unsupported" }
	| { status: "empty" };

export function useSurfaceFork(
	workspaceId: string,
	createNewAgentSession: CreateNewAgentSession,
): ForkIntoOtherSurface {
	const { t } = useLingui();
	const { transport } = useChatWiring();
	const { hostUrl } = useWorkspaceClient();
	const hostInfo = useHostServiceInfo(hostUrl);

	const hasMessages = useCallback(
		async (sessionId: string) => {
			const page = await transport.getItems({ sessionId });
			return (
				!page.ok ||
				page.nextBefore !== null ||
				page.envelopes.some(
					(envelope) =>
						envelope.event.type === "item" &&
						envelope.event.item.kind === "user_message",
				)
			);
		},
		[transport],
	);

	const forkIntoChat = useCallback(
		async (
			presetId: string,
			harnessSessionId: string,
			terminalId: string,
		): Promise<ChatFork> => {
			const harness = acpHarnessForPreset(presetId);
			if (!harness) return { status: "unsupported" };
			// The host forks only a live chat, so the terminal's session is first
			// loaded into a hidden one. It needs its own terminal id: the CLI's would
			// rebind that terminal's agent.
			const loaderTerminalId = crypto.randomUUID();
			ignoreChatTerminal(loaderTerminalId);
			const defaultModeId = acpStartModes(presetId)?.defaultModeId;
			const modeId =
				readSavedChatMode(presetId) ??
				(hostRemembersChatSelections(hostInfo.data?.version)
					? undefined
					: defaultModeId);
			const loader = await transport.createSession({
				commandId: crypto.randomUUID(),
				workspaceId,
				harness,
				terminalId: loaderTerminalId,
				...(modeId ? { modeId } : {}),
				...(defaultModeId ? { fallbackModeId: defaultModeId } : {}),
				resume: { harnessSessionId },
			});
			try {
				const forked = await transport
					.forkSession({
						commandId: crypto.randomUUID(),
						sessionId: loader.sessionId,
						workspaceId,
						terminalId,
					})
					.catch(async (error: unknown) => {
						if (!(await hasMessages(loader.sessionId).catch(() => true))) {
							return "empty" as const;
						}
						throw error;
					});
				if (forked === "empty") return { status: "empty" };
				return forked
					? { status: "forked", sessionId: forked.sessionId }
					: { status: "unsupported" };
			} finally {
				void transport
					.closeSession({ sessionId: loader.sessionId })
					.catch(() => undefined);
			}
		},
		[transport, workspaceId, hasMessages, hostInfo.data?.version],
	);

	return useCallback<ForkIntoOtherSurface>(
		async (ctx, source) => {
			const nothingToFork = t({
				message: "Nothing to open yet. Send a message first.",
			});

			if (source.into === "cli") {
				const { sessionId } = ctx.pane.data as ChatPaneData;
				if (sessionId && !(await hasMessages(sessionId).catch(() => true))) {
					toast.error(nothingToFork);
					return;
				}
				await createNewAgentSession({
					configId: source.configId,
					placement: "new-tab",
					prompt: "",
					forkSessionId: source.harnessSessionId,
				});
				return;
			}

			const terminalId = crypto.randomUUID();
			ignoreChatTerminal(terminalId);
			const toastId = toast.loading(
				t({ message: "Opening in Chat Interface…" }),
			);
			try {
				const forked = await forkIntoChat(
					source.presetId,
					source.harnessSessionId,
					terminalId,
				);
				if (forked.status !== "forked") {
					toast.error(
						forked.status === "empty"
							? nothingToFork
							: t({ message: "This agent can't branch a conversation" }),
						{ id: toastId },
					);
					return;
				}
				toast.dismiss(toastId);
				ctx.store.getState().addTab({
					panes: [
						{
							kind: "chat-v3",
							...(ctx.pane.titleOverride
								? { titleOverride: ctx.pane.titleOverride }
								: {}),
							data: {
								terminalId,
								sessionId: forked.sessionId,
								agent: { id: source.presetId },
							} satisfies ChatPaneData,
						},
					],
				});
			} catch (error) {
				toast.error(t({ message: "Couldn't open in Chat Interface" }), {
					id: toastId,
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			}
		},
		[forkIntoChat, hasMessages, createNewAgentSession, t],
	);
}
