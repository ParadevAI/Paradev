import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { errorMessage } from "@superset/i18n/errors";
import type { CreatePaneInput, RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import { markChatTerminalClosed } from "../../../../utils/closedChatSessions";
import type { CreateNewAgentSession } from "../../../useAgentSessionLauncher";
import { useChatWiring } from "../../components/ChatSession/hooks/useSessionClient";

export type SurfaceForkSource =
	| { into: "chat"; presetId: string; harnessSessionId: string }
	| { into: "cli"; configId: string; harnessSessionId: string };

export type SurfaceForkPlacement = "beside" | "tab";

export type ForkIntoOtherSurface = (
	ctx: RendererContext<PaneViewerData>,
	source: SurfaceForkSource,
	placement: SurfaceForkPlacement,
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
			// loaded into a hidden one. It needs its own terminal id (the CLI's would
			// rebind that terminal's agent), closed before the request so auto-adopt
			// never opens it.
			const loaderTerminalId = crypto.randomUUID();
			markChatTerminalClosed(loaderTerminalId);
			const loader = await transport.createSession({
				commandId: crypto.randomUUID(),
				workspaceId,
				harness,
				terminalId: loaderTerminalId,
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
		[transport, workspaceId, hasMessages],
	);

	return useCallback<ForkIntoOtherSurface>(
		async (ctx, source, placement) => {
			const nothingToFork = t({
				message: "Nothing to fork yet. Send a message first.",
			});
			const place = (newPane: CreatePaneInput<PaneViewerData>) => {
				const state = ctx.store.getState();
				const current = state.getPane(ctx.pane.id);
				if (placement === "tab" || !current) {
					state.addTab({ panes: [newPane] });
					return;
				}
				state.splitPane({
					tabId: current.tabId,
					paneId: ctx.pane.id,
					position: "right",
					newPane,
				});
			};

			if (source.into === "cli") {
				const { sessionId } = ctx.pane.data as ChatPaneData;
				if (sessionId && !(await hasMessages(sessionId).catch(() => true))) {
					toast.error(nothingToFork);
					return;
				}
				await createNewAgentSession({
					configId: source.configId,
					placement: placement === "tab" ? "new-tab" : "split-pane",
					besidePaneId: ctx.pane.id,
					prompt: "",
					forkSessionId: source.harnessSessionId,
				});
				return;
			}

			const terminalId = crypto.randomUUID();
			// Kept from auto-adopt until its pane exists, or it opens twice.
			const releaseTerminal = markChatTerminalClosed(terminalId);
			const toastId = toast.loading(t({ message: "Forking into a chat…" }));
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
				place({
					kind: "chat-v3",
					...(ctx.pane.titleOverride
						? { titleOverride: ctx.pane.titleOverride }
						: {}),
					data: {
						terminalId,
						sessionId: forked.sessionId,
						agent: { id: source.presetId },
					} satisfies ChatPaneData,
				});
			} catch (error) {
				toast.error(t({ message: "Couldn't fork into a chat" }), {
					id: toastId,
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			} finally {
				releaseTerminal();
			}
		},
		[forkIntoChat, hasMessages, createNewAgentSession, t],
	);
}
