import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { chatTransportFor } from "../../hooks/useSessionClient";
import { ChatPreviewCard } from "./components/ChatPreviewCard";
import { chatPreviewLoad } from "./utils/chatPreviewLoad";
import { previewMessages } from "./utils/previewMessages";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 100;
const PREVIEW_ITEMS = 60;
const FRESH_FOR_MS = 30_000;

/**
 * A card on hover or focus of a link to another chat: its title and the last
 * few messages, read from the host when the pointer arrives.
 */
export function ChatPreviewHoverCard({
	children,
	sessionId,
	workspaceId,
}: {
	children: ReactNode;
	sessionId: string;
	workspaceId: string;
}) {
	const host = useWorkspaceHostTarget(workspaceId);
	const hostUrl = host.status === "ready" ? host.url : null;
	const transport = useMemo(
		() => (hostUrl ? chatTransportFor(hostUrl) : null),
		[hostUrl],
	);
	const [open, setOpen] = useState(false);
	const [wanted, setWanted] = useState(false);
	const query = useQuery({
		queryKey: ["chat-reference-preview", hostUrl, workspaceId, sessionId],
		queryFn: async () => {
			if (!transport) return null;
			const { session } = await transport.getSession({ sessionId });
			if (!session || session.scopeId !== workspaceId) return null;
			const page = await transport.getItems({
				sessionId,
				limit: PREVIEW_ITEMS,
			});
			return {
				title: session.title?.trim() || null,
				messages: page.ok ? previewMessages(page.envelopes) : [],
			};
		},
		enabled: (wanted || open) && transport !== null,
		staleTime: FRESH_FOR_MS,
		retry: false,
	});
	const load = chatPreviewLoad(host, query);
	return (
		<HoverCard
			closeDelay={CLOSE_DELAY_MS}
			onOpenChange={setOpen}
			open={open}
			openDelay={OPEN_DELAY_MS}
		>
			<HoverCardTrigger
				asChild
				onClick={() => setOpen(false)}
				onContextMenu={() => setOpen(false)}
				onFocus={() => setWanted(true)}
				onPointerEnter={(event) => {
					if (event.pointerType !== "touch") setWanted(true);
				}}
			>
				{children}
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border-foreground/[0.08] p-0 shadow-xl"
				side="top"
				sideOffset={6}
			>
				<ChatPreviewCard load={load} />
			</HoverCardContent>
		</HoverCard>
	);
}
