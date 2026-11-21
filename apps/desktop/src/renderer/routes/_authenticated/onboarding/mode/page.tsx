import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { track } from "renderer/lib/analytics";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { type AgentMode, useAgentModeStore } from "../stores/agentModeStore";
import { ChatSketch } from "./components/ChatSketch";
import { ModeCard } from "./components/ModeCard";
import { TerminalSketch } from "./components/TerminalSketch";

export const Route = createFileRoute("/_authenticated/onboarding/mode/")({
	component: OnboardingModePage,
});

const DEFAULT_MODE: AgentMode = "chat";

function OnboardingModePage() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const picked = useAgentModeStore((s) => s.picked);
	const setPicked = useAgentModeStore((s) => s.setPicked);
	const selected = picked ?? DEFAULT_MODE;

	const updateSettings = cloudTrpc.userSettings.update.useMutation({
		onSuccess: (next) => utils.userSettings.get.setData(undefined, next),
	});

	const save = (mode: AgentMode, source: "default" | "user") => {
		const previous = useAgentModeStore.getState().picked;
		setPicked(mode);
		track("onboarding_agent_mode_selected", { mode, source });
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

	const savedDefault = useRef(false);
	useEffect(() => {
		if (savedDefault.current || useAgentModeStore.getState().picked !== null) {
			return;
		}
		savedDefault.current = true;
		save(DEFAULT_MODE, "default");
	});

	const pick = (mode: AgentMode) => {
		if (mode !== picked) save(mode, "user");
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
