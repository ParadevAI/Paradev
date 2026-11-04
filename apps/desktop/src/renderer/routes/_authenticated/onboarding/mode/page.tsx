import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { track } from "renderer/lib/analytics";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChatSketch } from "./components/ChatSketch";
import { ModeCard } from "./components/ModeCard";
import { TerminalSketch } from "./components/TerminalSketch";

export const Route = createFileRoute("/_authenticated/onboarding/mode/")({
	component: OnboardingModePage,
});

type AgentMode = "terminal" | "chat";

function OnboardingModePage() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const { data: settings } = cloudTrpc.userSettings.get.useQuery();
	const [picked, setPicked] = useState<AgentMode | null>(null);

	const savedMode: AgentMode | null = settings?.experimentalChat
		? "chat"
		: null;
	const selected = picked ?? savedMode;

	const updateSettings = cloudTrpc.userSettings.update.useMutation({
		onSuccess: (next) => utils.userSettings.get.setData(undefined, next),
	});

	const pick = (mode: AgentMode) => {
		if (mode === selected) return;
		const previous = picked;
		setPicked(mode);
		track("onboarding_agent_mode_selected", { mode });
		updateSettings.mutate(
			{ experimentalChat: mode === "chat" },
			{
				onError: () => {
					setPicked(previous);
					toast.error(t({ message: "Couldn't save your choice. Try again." }));
				},
			},
		);
	};

	return (
		<fieldset className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
			<legend className="sr-only">
				{t({ message: "How you run agents" })}
			</legend>
			<ModeCard
				name="agent-mode"
				title={t({ message: "Terminal" })}
				sketch={<TerminalSketch active={selected === "terminal"} />}
				selected={selected === "terminal"}
				onSelect={() => pick("terminal")}
			/>
			<ModeCard
				name="agent-mode"
				title={t({ message: "Chat" })}
				sketch={<ChatSketch active={selected === "chat"} />}
				selected={selected === "chat"}
				onSelect={() => pick("chat")}
			/>
		</fieldset>
	);
}
