import {
	AGENT_PRESET_COMMANDS,
	buildAgentPromptCommand,
} from "@superset/shared/agent-command";
import {
	type AgentLaunchRequest,
	STARTABLE_AGENT_LABELS,
	STARTABLE_AGENT_TYPES,
	type StartableAgentType,
} from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useRef, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";

type WorkspaceCreateAgent = StartableAgentType | "none";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

interface PromptGroupProps {
	projectId: string | null;
	onClose: () => void;
}

export function PromptGroup({ projectId, onClose }: PromptGroupProps) {
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const isDark = useIsDarkTheme();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [prompt, setPrompt] = useState("");
	const createWorkspace = useCreateWorkspace();
	const [selectedAgent, setSelectedAgent] = useState<WorkspaceCreateAgent>(
		() => {
			if (typeof window === "undefined") return "none";
			const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
			if (stored === "none") return "none";
			return stored &&
				(STARTABLE_AGENT_TYPES as readonly string[]).includes(stored)
				? (stored as WorkspaceCreateAgent)
				: "none";
		},
	);

	const handleAgentChange = (value: WorkspaceCreateAgent) => {
		setSelectedAgent(value);
		window.localStorage.setItem(AGENT_STORAGE_KEY, value);
	};

	const buildLaunchRequest = (
		trimmedPrompt: string,
	): AgentLaunchRequest | null => {
		if (selectedAgent === "none") return null;

		if (selectedAgent === "superset-chat") {
			return {
				kind: "chat",
				workspaceId: "pending-workspace",
				agentType: "superset-chat",
				source: "new-workspace",
				chat: {
					initialPrompt: trimmedPrompt || undefined,
				},
			};
		}

		const command = trimmedPrompt
			? buildAgentPromptCommand({
					prompt: trimmedPrompt,
					randomId: window.crypto.randomUUID(),
					agent: selectedAgent,
				})
			: (AGENT_PRESET_COMMANDS[selectedAgent][0] ?? null);

		if (!command) return null;

		return {
			kind: "terminal",
			workspaceId: "pending-workspace",
			agentType: selectedAgent,
			source: "new-workspace",
			terminal: {
				command,
				name: "Agent",
			},
		};
	};

	const handleCreate = () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}
		const trimmedPrompt = prompt.trim();
		const launchRequest = buildLaunchRequest(trimmedPrompt);

		onClose();
		toast.promise(
			createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId,
					prompt: trimmedPrompt || undefined,
				},
				launchRequest ? { agentLaunchRequest: launchRequest } : undefined,
			),
			{
				loading: "Creating workspace...",
				success: "Workspace created",
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		);
	};

	return (
		<div className="p-3 space-y-3" cmdk-group="">
			<Select
				value={selectedAgent}
				onValueChange={(value: WorkspaceCreateAgent) =>
					handleAgentChange(value)
				}
			>
				<SelectTrigger className="h-8 text-xs w-full">
					<SelectValue placeholder="No agent" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">No agent</SelectItem>
					{(STARTABLE_AGENT_TYPES as readonly StartableAgentType[]).map(
						(agent) => {
							const icon = getPresetIcon(agent, isDark);
							return (
								<SelectItem key={agent} value={agent}>
									<span className="flex items-center gap-2">
										{icon && (
											<img
												src={icon}
												alt=""
												className="size-5 object-contain"
											/>
										)}
										{agent === "superset-chat"
											? "Superset"
											: STARTABLE_AGENT_LABELS[agent]}
									</span>
								</SelectItem>
							);
						},
					)}
				</SelectContent>
			</Select>

			<Textarea
				ref={textareaRef}
				className="min-h-24 max-h-48 text-sm resize-y field-sizing-fixed"
				placeholder="What do you want to do?"
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						handleCreate();
					}
				}}
			/>

			<Button className="w-full h-8 text-sm" onClick={handleCreate}>
				Create Workspace
				<KbdGroup className="ml-1.5 opacity-70">
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						{modKey}
					</Kbd>
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						↵
					</Kbd>
				</KbdGroup>
			</Button>
		</div>
	);
}
