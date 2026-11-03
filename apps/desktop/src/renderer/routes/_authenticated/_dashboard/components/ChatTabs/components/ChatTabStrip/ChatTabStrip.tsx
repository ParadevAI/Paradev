import { useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { useRouter } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { LuHash, LuLock, LuMessageSquareText } from "react-icons/lu";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useTitleBarMainSlot } from "renderer/routes/_authenticated/_dashboard/providers/TitleBarSlotsProvider";
import {
	type ChatTab as ChatTabModel,
	organizationChatTabs,
	useChatTabsStore,
} from "renderer/routes/_authenticated/_dashboard/stores/chatTabsStore";
import { ChatTab } from "../ChatTab";

type Channel = RouterOutputs["channel"]["list"][number];
type Dev = RouterOutputs["agent"]["list"][number];

interface ChatTabStripProps {
	organizationId: string | null;
	channels: readonly Channel[];
	devs: readonly Dev[];
}

/** The Chat section's open channels and Devs, as tabs in the title bar. */
export function ChatTabStrip({
	organizationId,
	channels,
	devs,
}: ChatTabStripProps) {
	const { t } = useLingui();
	const router = useRouter();
	const slot = useTitleBarMainSlot();
	const allTabs = useChatTabsStore((state) => state.tabs);
	const tabs = organizationChatTabs(allTabs, organizationId);
	const activeTabId = useChatTabsStore((state) => state.activeTabId);
	const closeTab = useChatTabsStore((state) => state.close);

	const describe = (tab: ChatTabModel) => {
		if (tab.kind === "threads") {
			return {
				label: t({ message: "Threads" }),
				icon: <LuMessageSquareText />,
			};
		}
		if (tab.kind === "channel") {
			const channel = channels.find(
				(candidate) => candidate.id === tab.entityId,
			);
			return {
				label: channel?.name ?? t({ message: "Channel" }),
				icon: channel?.visibility === "private" ? <LuLock /> : <LuHash />,
			};
		}
		const dev = devs.find((candidate) => candidate.id === tab.entityId);
		return {
			label: dev?.name ?? t({ message: "Dev" }),
			icon: dev ? <DevAvatar avatar={dev.avatar} size={14} /> : null,
		};
	};

	const go = (href: string) => {
		router.navigate({ href }).catch((error: unknown) => {
			console.error("[ChatTabs] navigation failed", href, error);
		});
	};

	const close = (tab: ChatTabModel) => {
		const { wasActive, next } = closeTab(tab.id);
		if (wasActive) go(next?.href ?? "/new-workspace");
	};

	if (!slot) return null;
	return createPortal(
		<div className="flex h-full min-w-0 flex-1 items-center">
			<nav
				aria-label={t({ message: "Chat" })}
				className="hide-scrollbar flex h-full min-w-0 items-center gap-1 overflow-x-auto pl-1.5"
			>
				{tabs.map((tab) => {
					const { label, icon } = describe(tab);
					return (
						<ChatTab
							key={tab.id}
							label={label}
							icon={icon}
							isActive={tab.id === activeTabId}
							onActivate={() => go(tab.href)}
							onClose={() => close(tab)}
						/>
					);
				})}
			</nav>
			<div className="drag h-full min-w-4 flex-1" />
		</div>,
		slot,
	);
}
