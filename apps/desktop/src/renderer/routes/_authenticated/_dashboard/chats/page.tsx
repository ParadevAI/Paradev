import { Trans } from "@lingui/react/macro";
import { chatRows } from "@superset/chats-core";
import { createFileRoute } from "@tanstack/react-router";
import { Redirect } from "renderer/components/Redirect";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { NameDevCard } from "./components/NameDevCard";
import { useChats } from "./hooks/useChats";

export const Route = createFileRoute("/_authenticated/_dashboard/chats/")({
	component: ChatsHome,
});

/** Chats with none open: the most recent one, or the first step for someone new. */
function ChatsHome() {
	const chats = useChats();
	if (!chats?.state) {
		return (
			<StateScreenShell>
				{chats?.status.kind === "error" && (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						<Trans>Couldn't load your chats. Trying again…</Trans>
					</div>
				)}
			</StateScreenShell>
		);
	}
	const [first] = chatRows(chats.state, "all");
	if (first) {
		return (
			<Redirect
				to="/chats/$chatId"
				params={{ chatId: first.chat.id }}
				replace
			/>
		);
	}
	return (
		<StateScreenShell>
			<div className="flex h-full items-center justify-center pb-[10vh]">
				<NameDevCard
					onCreate={(name) =>
						chats.actions.createPersonalDev({ name, color: "#F2B23E" })
					}
				/>
			</div>
		</StateScreenShell>
	);
}
