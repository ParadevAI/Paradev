import { Trans, useLingui } from "@lingui/react/macro";
import { acpStartModes } from "@superset/chat/core";
import { ComposerDropZone } from "@superset/chat-ui/ComposerDropZone";
import { draftText } from "@superset/chat-ui/PromptInput";
import {
	getAgentEffortSupport,
	getAgentEfforts,
	getAgentModelSupport,
	getAgentModeSupport,
} from "@superset/shared/agent-models";
import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { Button } from "@superset/ui/button";
import { isEnterSubmit } from "@superset/ui/lib/keyboard";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { HistoryIcon, Settings2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuGitPullRequest } from "react-icons/lu";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { GitHubStarPill } from "renderer/components/GitHubStarPill";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { useAgentModePreference } from "renderer/hooks/useAgentModePreference";
import { useCloudAgentChoices } from "renderer/hooks/useCloudAgentChoices";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useSelectedHostProjectIds } from "renderer/hooks/useSelectedHostProjectIds";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { track } from "renderer/lib/analytics";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";
import {
	type AgentSwitcher,
	ModelPicker,
} from "renderer/routes/_authenticated/components/AgentComposer/components/ModelPicker";
import { ModePicker } from "renderer/routes/_authenticated/components/AgentComposer/components/ModePicker";
import { useGitHubMentionProviders } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useGitHubMentionProviders";
import { draftLinkedContext } from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import { CreateEnvironmentFlow } from "renderer/routes/_authenticated/components/CreateEnvironmentFlow";
import { useMachineSizeOptions } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspacePromptContext } from "renderer/stores/new-workspace-prompt-context";
import {
	NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH,
	NEW_WORKSPACE_SCREEN_MAX_WIDTH,
	NEW_WORKSPACE_SCREEN_MIN_WIDTH,
	useNewWorkspaceWidthStore,
} from "renderer/stores/new-workspace-width";
import {
	environmentBranchKey,
	NO_PROJECT_KEY,
	useV2WorkspaceCreateDefaultsStore,
} from "renderer/stores/v2-workspace-create-defaults";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import { resolveRemoteHostPresence } from "../../utils/resolveRemoteHostPresence";
import { DevicePicker } from "../DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "../DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { CheckoutPickerPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/CheckoutPickerPill";
import { CompareBaseBranchPicker } from "../DashboardNewWorkspaceForm/PromptGroup/components/CompareBaseBranchPicker";
import { EnvironmentPickerPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/EnvironmentPickerPill";
import { MachineSizePickerPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/MachineSizePickerPill";
import { ProjectPickerPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/ProjectPickerPill";
import { PromptHistoryCommand } from "../DashboardNewWorkspaceForm/PromptGroup/components/PromptHistoryCommand";
import { useBranchPickerController } from "../DashboardNewWorkspaceForm/PromptGroup/hooks/useBranchPickerController";
import { useSubmitWorkspace } from "../DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace";
import {
	CLOUD_UPLOAD_TARGET,
	useUploadAttachments,
} from "../DashboardNewWorkspaceForm/PromptGroup/hooks/useUploadAttachments";
import {
	AGENT_STORAGE_KEY,
	EFFORT_STORAGE_KEY,
	MODE_STORAGE_KEY,
	MODEL_STORAGE_KEY,
	type WorkspaceCreateAgent,
} from "../DashboardNewWorkspaceForm/PromptGroup/types";
import { SymmetricResizeHandles } from "../SymmetricResizeHandles";
import { NoAgentToggle } from "./components/NoAgentToggle";
import { SamplePrompts } from "./components/SamplePrompts";
import { PROMPT_PLACEHOLDERS } from "./components/SamplePrompts/constants";
import { SupersetIcon } from "./components/SupersetIcon";
import { useGitHubRepositoryProjects } from "./hooks/useGitHubRepositoryProjects";
import { useLinkedIssueNaming } from "./hooks/useLinkedIssueNaming";
import { useProjectPreselection } from "./hooks/useProjectPreselection";
import { useSamplePromptSelection } from "./hooks/useSamplePromptSelection";
import {
	AGENT_DEFAULT_OPTION_ID,
	LAUNCH_EFFORT_OPTION_ID,
	LAUNCH_MODEL_OPTION_ID,
	launchConfigOptions,
	launchOptionValue,
} from "./utils/launchConfigOptions";
import { resolveCloudChoices } from "./utils/resolveCloudChoices";

const NO_HIDDEN_MODES: ReadonlySet<string> = new Set();

const SAMPLE_PROMPT_COUNT = 3;

interface NewWorkspaceScreenProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	/** Open with "No project" (session) preselected. */
	preSelectedSession?: boolean;
	/** Open targeting this host instead of the remembered one. */
	preSelectedHostId?: string | null;
}

/**
 * The v2 workspace-creation surface: heading, sample prompts, and a minimal
 * composer, filling the window rather than a dialog.
 */
function launchPresetIdOf(agent: AgentSelectAgent): string {
	return agent.launchPresetId ?? agent.presetId ?? agent.iconId ?? agent.id;
}

export function NewWorkspaceScreen({
	isOpen,
	preSelectedProjectId,
	preSelectedSession = false,
	preSelectedHostId = null,
}: NewWorkspaceScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [promptSeed, setPromptSeed] = useState(0);
	const {
		closeModal,
		draft,
		updateDraft,
		selectProject,
		selectSession,
		resetKey,
	} = useDashboardNewWorkspaceDraft();
	const hostService = useLocalHostService();
	const { activeHostUrl, machineId } = hostService;
	const relayUrl = useRelayUrl();
	const activeOrganizationId = useActiveOrganizationId();

	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);
	const setLastProjectChoice = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectChoice,
	);
	const setCheckoutDefault = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setCheckout,
	);
	const cloudChoices = useV2WorkspaceCreateDefaultsStore(
		(state) => state.cloudChoices,
	);
	const setCloudChoice = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setCloudChoice,
	);
	const samplePromptsDismissed = useV2WorkspaceCreateDefaultsStore(
		(state) => state.samplePromptsDismissed,
	);
	const setSamplePromptsDismissed = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setSamplePromptsDismissed,
	);

	useEffect(() => {
		if (!isOpen) return;
		track("new_workspace_screen_shown");
	}, [isOpen]);

	// Main-area drop zone. dragover fires continuously while a
	// drag is over it, so a short timeout self-heals every missed-event
	// case (Esc-cancelled drags, drops outside the window) that an enter/leave
	// counter gets permanently stuck on.
	// ── Projects ─────────────────────────────────────────────────────
	const { projects: hostProjects, isReady: areProjectsReady } =
		useHostProjects();
	const setUpProjectIds = useSelectedHostProjectIds(draft.hostId);
	const projects = useMemo(
		() =>
			hostProjects
				.filter((project) => Boolean(project.projectKey))
				.map((project) => ({
					id: project.projectKey,
					name: project.name,
					githubOwner: project.repoOwner,
					githubRepoName: project.repoName,
					iconUrl: project.repoOwner
						? `https://github.com/${project.repoOwner}.png?size=64`
						: null,
					needsSetup:
						setUpProjectIds === null
							? null
							: !setUpProjectIds.has(project.projectKey),
				})),
		[hostProjects, setUpProjectIds],
	);

	const isCloudHost = draft.hostId === CLOUD_HOST_ID;
	// On the cloud the GitHub App's repositories join the picker as stand-in
	// projects; a device's projects are its checkouts.
	const github = useGitHubRepositoryProjects({
		organizationId: activeOrganizationId,
		enabled: isCloudHost && !!activeOrganizationId,
		projects,
	});
	// The cloud starts from a GitHub repository, so a project without one
	// can't be picked there.
	const cloudHostProjects = useMemo(
		() =>
			projects
				.filter((project) => project.githubOwner && project.githubRepoName)
				.map((project) => ({ ...project, needsSetup: null })),
		[projects],
	);
	const cloudProjects = useMemo(
		() => [...cloudHostProjects, ...github.repositories],
		[cloudHostProjects, github.repositories],
	);
	const selectableProjects = isCloudHost ? cloudProjects : projects;

	const lastProjectChoice = useV2WorkspaceCreateDefaultsStore(
		(state) =>
			state.lastProjectChoice[isCloudHost ? "cloud" : "device"] ?? null,
	);
	const isProjectPreselectionPending = useProjectPreselection({
		isOpen,
		areProjectsReady: areProjectsReady && (!isCloudHost || !github.isLoading),
		projects: selectableProjects,
		preSelectedProjectId,
		preSelectedSession,
		selectedProjectId: draft.selectedProjectId,
		isSession: draft.isSession,
		target: isCloudHost ? "cloud" : "device",
		lastChoice: lastProjectChoice,
		selectProject,
		selectSession,
		updateDraft,
	});

	// A project without a GitHub repository can't start in the cloud, so a
	// handoff of one keeps everything but the host.
	useEffect(() => {
		if (
			!isOpen ||
			!isCloudHost ||
			!preSelectedProjectId ||
			!areProjectsReady ||
			github.isLoading ||
			!machineId
		)
			return;
		const isCloudProject = cloudProjects.some(
			(project) => project.id === preSelectedProjectId,
		);
		const isDeviceProject = projects.some(
			(project) => project.id === preSelectedProjectId,
		);
		if (!isCloudProject && isDeviceProject) updateDraft({ hostId: machineId });
	}, [
		isOpen,
		isCloudHost,
		preSelectedProjectId,
		areProjectsReady,
		github.isLoading,
		machineId,
		cloudProjects,
		projects,
		updateDraft,
	]);

	const storedComposerWidth = useNewWorkspaceWidthStore(
		(state) => state.screenWidth,
	);
	const setStoredComposerWidth = useNewWorkspaceWidthStore(
		(state) => state.setScreenWidth,
	);
	/** Width while a resize drag is in flight; persisted on release. */
	const [liveComposerWidth, setLiveComposerWidth] = useState<number | null>(
		null,
	);
	const composerWidth = liveComposerWidth ?? storedComposerWidth;

	// One suggestion per open. resetKey only bumps on resetDraft, so ordinary
	// modal reopens roll their own counter; the tiptap Placeholder extension
	// freezes its text at editor mount, so the roll also rides the editor key.
	const [placeholderRoll, setPlaceholderRoll] = useState(0);
	const wasOpenRef = useRef(isOpen);
	useEffect(() => {
		if (isOpen && !wasOpenRef.current) {
			setPlaceholderRoll((roll) => roll + 1);
		}
		wasOpenRef.current = isOpen;
	}, [isOpen]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-roll per draft reset and per open
	const promptPlaceholder = useMemo(() => {
		const descriptor =
			PROMPT_PLACEHOLDERS[
				Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length)
			];
		return descriptor
			? t(descriptor)
			: t({
					message: "What do you want to do?",
				});
	}, [resetKey, placeholderRoll, t]);

	const projectId = draft.selectedProjectId;
	const selectedProject = selectableProjects.find(
		(project) => project.id === projectId,
	);
	const needsSetup = !isCloudHost && selectedProject?.needsSetup === true;

	// ── Cloud environment ────────────────────────────────────────────
	const environmentsQuery = cloudTrpc.environment.list.useQuery(
		{ organizationId: activeOrganizationId ?? "" },
		{ enabled: isCloudHost && !!activeOrganizationId },
	);
	const projectRepositoryFullName =
		selectedProject?.githubOwner && selectedProject.githubRepoName
			? `${selectedProject.githubOwner}/${selectedProject.githubRepoName}`
			: null;
	const machineSizeOptions = useMachineSizeOptions();
	const cloudProjectId = draft.isSession ? null : projectId;
	const cloudChoiceKey = cloudProjectId ?? NO_PROJECT_KEY;
	const cloudSelection = useMemo(
		() =>
			resolveCloudChoices({
				environments: startableCloudEnvironments(environmentsQuery.data ?? []),
				projectId: cloudProjectId,
				repositoryFullName: projectRepositoryFullName,
				choices: cloudChoices,
				offeredSizes: machineSizeOptions.options.map((option) => option.size),
				defaultSize: machineSizeOptions.defaultSize,
			}),
		[
			environmentsQuery.data,
			cloudProjectId,
			projectRepositoryFullName,
			cloudChoices,
			machineSizeOptions,
		],
	);
	const resolvedEnvironment = cloudSelection.environment ?? undefined;
	const isCloudTargetLoading = environmentsQuery.isLoading || github.isLoading;
	const [isCreatingEnvironment, setIsCreatingEnvironment] = useState(false);
	const cloudRepository = useMemo(() => {
		if (!isCloudHost) return null;
		const primary = resolvedEnvironment?.repositories?.[0];
		return primary
			? {
					owner: primary.owner,
					name: primary.name,
					defaultBranch: primary.defaultBranch,
				}
			: null;
	}, [isCloudHost, resolvedEnvironment]);
	const isPromptEmpty = !draftText(draft.promptDraft).trim();
	// The markdown editor is uncontrolled after mount, so programmatic prompt
	// insertion bumps promptSeed to remount it with the new content.
	const applyPrompt = useCallback(
		(prompt: string) => {
			updateDraft({ promptDraft: [{ type: "text", text: prompt }] });
			setPromptSeed((seed) => seed + 1);
		},
		[updateDraft],
	);
	const { issues: linkedIssues, pr: linkedPR } = useMemo(
		() => draftLinkedContext(draft.promptDraft),
		[draft.promptDraft],
	);
	useLinkedIssueNaming(linkedIssues);

	// Restore the last-used launch host once per mount, like the modal does.
	// A host named in the URL (the sidebar's Cloud "+") wins, and applies when
	// it arrives rather than only at mount — this screen stays mounted across
	// navigations to it.
	const appliedPersistedHostRef = useRef(false);
	const appliedPreSelectedHostRef = useRef<string | null>(null);
	useEffect(() => {
		if (!isOpen) return;
		if (
			preSelectedHostId &&
			preSelectedHostId !== appliedPreSelectedHostRef.current
		) {
			appliedPreSelectedHostRef.current = preSelectedHostId;
			appliedPersistedHostRef.current = true;
			updateDraft({ hostId: preSelectedHostId });
			return;
		}
		if (appliedPersistedHostRef.current) return;
		appliedPersistedHostRef.current = true;
		const persistedHostId =
			useV2WorkspaceCreateDefaultsStore.getState().lastHostId;
		if (typeof persistedHostId === "string") {
			updateDraft({ hostId: persistedHostId });
		}
	}, [isOpen, preSelectedHostId, updateDraft]);

	// Reset baseBranch when what it branches from changes, defaulting to the
	// user's last branch there — the draft store is global, so a stale branch
	// from another repository would otherwise ride into the create. On the
	// cloud that is the environment's repository, not the project's.
	const branchDefaultKey = isCloudHost
		? resolvedEnvironment
			? environmentBranchKey(resolvedEnvironment.id)
			: null
		: projectId;
	const persistedBaseBranchDefault = useV2WorkspaceCreateDefaultsStore(
		(state) =>
			branchDefaultKey
				? (state.baseBranchesByProjectId[branchDefaultKey] ?? null)
				: null,
	);
	const setBaseBranchDefault = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setBaseBranchDefault,
	);
	const clearBaseBranchDefault = useV2WorkspaceCreateDefaultsStore(
		(state) => state.clearBaseBranchDefault,
	);
	const previousBranchDefaultKeyRef = useRef(branchDefaultKey);
	const previousHostIdRef = useRef(draft.hostId);
	useEffect(() => {
		if (
			previousBranchDefaultKeyRef.current !== branchDefaultKey ||
			previousHostIdRef.current !== draft.hostId
		) {
			previousBranchDefaultKeyRef.current = branchDefaultKey;
			previousHostIdRef.current = draft.hostId;
			updateDraft({
				baseBranch: persistedBaseBranchDefault?.branchName ?? null,
				baseBranchSource: persistedBaseBranchDefault?.source ?? null,
			});
		}
	}, [branchDefaultKey, draft.hostId, persistedBaseBranchDefault, updateDraft]);

	// ── Agent / model / effort ───────────────────────────────────────
	const launchHostUrl = useMemo(() => {
		const id = draft.hostId ?? machineId;
		if (!id || !activeOrganizationId) return null;
		return (
			resolveHostUrl({
				hostId: id,
				machineId,
				activeHostUrl,
				organizationId: activeOrganizationId,
				relayUrl,
			}) ?? null
		);
	}, [draft.hostId, machineId, activeHostUrl, activeOrganizationId, relayUrl]);
	const githubProviders = useGitHubMentionProviders(
		useMemo(
			() =>
				projectId && launchHostUrl
					? { projectId, hostUrl: launchHostUrl }
					: null,
			[projectId, launchHostUrl],
		),
	);

	// One signal drives both the prompt tier and the dismiss affordance: has
	// this person shipped anything yet. Every workspace is something they
	// created — nothing seeds one for them.
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const hasRealWorkspace = hostWorkspaces.length > 0;

	const samplePromptTier = hasRealWorkspace ? "returning" : "first-run";
	const { prompts: samplePrompts, isPending: samplePromptsPending } =
		useSamplePromptSelection(
			samplePromptTier,
			launchHostUrl,
			projectId,
			SAMPLE_PROMPT_COUNT,
		);

	const handleDismissSamplePrompts = useCallback(() => {
		track("new_workspace_sample_prompts_dismissed");
		setSamplePromptsDismissed(true);
	}, [setSamplePromptsDismissed]);

	const { agents: hostAgents, isFetched: hostAgentsFetched } =
		useV2AgentChoices(launchHostUrl);
	const cloudAgents = useCloudAgentChoices();
	// Under Cloud the built-in presets stand in for a host's agent list.
	const v2Agents = draft.hostId === CLOUD_HOST_ID ? cloudAgents : hostAgents;
	const v2AgentsFetched = draft.hostId === CLOUD_HOST_ID || hostAgentsFetched;
	const selectableAgentIds = useMemo(
		() => v2Agents.map((agent) => agent.id),
		[v2Agents],
	);
	const { selectedAgent, setSelectedAgent } =
		useAgentLaunchPreferences<WorkspaceCreateAgent>({
			agentStorageKey: AGENT_STORAGE_KEY,
			defaultAgent: selectableAgentIds[0] ?? "none",
			fallbackAgent: selectableAgentIds[0] ?? "none",
			validAgents: ["none", ...selectableAgentIds],
			agentsReady: v2AgentsFetched,
		});

	const selectedPresetId = useMemo(() => {
		const agent = v2Agents.find((candidate) => candidate.id === selectedAgent);
		return agent ? launchPresetIdOf(agent) : null;
	}, [v2Agents, selectedAgent]);
	const modelSupport = selectedPresetId
		? getAgentModelSupport(selectedPresetId)
		: undefined;
	const { selectedModel, setSelectedModel } = useAgentModelPreference(
		MODEL_STORAGE_KEY,
		modelSupport ? selectedPresetId : null,
	);
	const effortSupport = selectedPresetId
		? getAgentEffortSupport(selectedPresetId)
		: undefined;
	const { selectedEffort, setSelectedEffort } = useAgentEffortPreference(
		EFFORT_STORAGE_KEY,
		effortSupport ? selectedPresetId : null,
	);
	// Codex's top two efforts only exist on its GPT-5.6 models and cursor-agent
	// has a ladder for only some models, so the offered list follows the model
	// picker and the control disappears when there is nothing to offer. A
	// remembered effort the current model rejects stays stored but shows (and
	// launches) as the agent default.
	const effortOptions = useMemo(
		() =>
			selectedPresetId
				? getAgentEfforts(selectedPresetId, selectedModel ?? undefined)
				: [],
		[selectedPresetId, selectedModel],
	);
	const effortForLaunch = effortOptions.some(
		(option) => option.id === selectedEffort,
	)
		? selectedEffort
		: null;
	const modeSupport = selectedPresetId
		? getAgentModeSupport(selectedPresetId)
		: undefined;
	const acpChatEnabled = useAcpChatEnabled() === "enabled";
	const startModes = acpChatEnabled
		? acpStartModes(selectedPresetId)
		: undefined;
	const pickerModes = useMemo(
		() =>
			startModes?.modes ??
			(modeSupport
				? [
						{
							id: AGENT_DEFAULT_OPTION_ID,
							label: t({ message: "Direct mode" }),
						},
						...modeSupport.modes.map(({ id, label }) => ({ id, label })),
					]
				: undefined),
		[startModes, modeSupport, t],
	);
	const validModeIds = useMemo(
		() => (startModes ?? modeSupport)?.modes.map((mode) => mode.id),
		[startModes, modeSupport],
	);
	const { selectedMode, setSelectedMode } = useAgentModePreference(
		MODE_STORAGE_KEY,
		pickerModes ? selectedPresetId : null,
		validModeIds,
	);
	const modeForLaunch = pickerModes ? selectedMode : null;
	const launchOptions = useMemo(
		() =>
			launchConfigOptions({
				modelSupport,
				selectedModel,
				efforts: effortOptions,
				selectedEffort,
				labels: {
					model: t({ message: "Model" }),
					defaultModel: t({ message: "Default model" }),
					effort: t({ message: "Effort" }),
					defaultEffort: t({ message: "Default" }),
				},
			}),
		[effortOptions, modelSupport, selectedEffort, selectedModel, t],
	);
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const selectLaunchOption = useCallback(
		(configId: string, value: string) => {
			const picked = launchOptionValue(value);
			if (configId === LAUNCH_MODEL_OPTION_ID) setSelectedModel(picked);
			else if (configId === LAUNCH_EFFORT_OPTION_ID) setSelectedEffort(picked);
		},
		[setSelectedEffort, setSelectedModel],
	);
	// A model picked under another agent's tab lands once that agent's
	// preference hook has re-keyed to it.
	const pendingSwitchModel = useRef<{
		agent: WorkspaceCreateAgent;
		model: string;
	} | null>(null);
	useEffect(() => {
		const pending = pendingSwitchModel.current;
		if (!pending || pending.agent !== selectedAgent) return;
		pendingSwitchModel.current = null;
		setSelectedModel(pending.model);
	}, [selectedAgent, setSelectedModel]);
	const agentSwitcher = useMemo<AgentSwitcher | undefined>(() => {
		if (selectedAgent === "none") return undefined;
		return {
			currentPresetId: selectedAgent,
			agents: v2Agents.map((agent) => ({
				presetId: agent.id,
				iconId: agent.iconId ?? agent.presetId,
				label: agent.label,
				models: (
					getAgentModelSupport(launchPresetIdOf(agent))?.models ?? []
				).map(({ id, label }) => ({ id, label })),
			})),
			onSwitch: (agentId, model) => {
				pendingSwitchModel.current = model
					? { agent: agentId, model: model.id }
					: null;
				setSelectedAgent(agentId);
			},
		};
	}, [selectedAgent, setSelectedAgent, v2Agents]);

	const { otherHosts, hostsSettled } = useWorkspaceHostOptions();
	const selectedRemoteHostPresence = useMemo(
		() =>
			resolveRemoteHostPresence({
				selectedHostId: draft.hostId ?? machineId,
				localHostId: machineId,
				hosts: otherHosts,
				hostsSettled,
			}),
		[draft.hostId, machineId, otherHosts, hostsSettled],
	);

	// ── Base branch ──────────────────────────────────────────────────
	const { pickerProps } = useBranchPickerController({
		projectId,
		hostId: draft.hostId,
		remoteHostPresence: selectedRemoteHostPresence,
		cloudRepository,
		baseBranch: draft.baseBranch,
		typedWorkspaceName: draft.workspaceName,
		onBaseBranchChange: (branch, source) => {
			if (branchDefaultKey) {
				if (branch && source) {
					setBaseBranchDefault(branchDefaultKey, branch, source);
				} else {
					clearBaseBranchDefault(branchDefaultKey);
				}
			}
			updateDraft({ baseBranch: branch, baseBranchSource: source });
		},
		closeModal,
	});

	// ── Submit ───────────────────────────────────────────────────────
	// A cloud workspace has no host to upload to, so its attachments go to
	// cloud storage and the sandbox pulls them once it is up.
	const uploadTarget =
		(draft.hostId ?? machineId) === CLOUD_HOST_ID
			? CLOUD_UPLOAD_TARGET
			: launchHostUrl;
	const uploadAttachments = useUploadAttachments({
		files: draft.promptAttachments,
		hostUrl: uploadTarget,
	});
	const promptContext = useNewWorkspacePromptContext({
		projectId,
		hostId: draft.hostId,
		linkedPR,
		linkedIssues,
	});
	const { submitWorkspace: createWorkspace, isCreating } = useSubmitWorkspace(
		projectId,
		selectedAgent,
		selectedPresetId,
		modelSupport ? selectedModel : null,
		effortForLaunch,
		modeForLaunch,
		uploadAttachments,
		promptContext,
		resolvedEnvironment?.id ?? null,
		isCloudHost ? cloudSelection.machineSize : null,
	);

	const submitBlocker = useMemo<string | null>(() => {
		const selectedHostId = draft.hostId ?? machineId;
		// A cloud workspace is provisioned by the API from its environment: no
		// host readiness to wait on, and the project only narrows the list.
		if (selectedHostId === CLOUD_HOST_ID) {
			if (isCloudTargetLoading) return t({ message: "Loading environments…" });
			return resolvedEnvironment
				? null
				: t({ message: "Select an environment" });
		}
		if (isProjectPreselectionPending || (!selectedProject && !draft.isSession))
			return t({
				message: "Select a project",
			});
		if (!selectedHostId)
			return t({
				message: "No active host",
			});
		if (selectedRemoteHostPresence !== null) {
			if (selectedRemoteHostPresence !== "online")
				return t({
					message: "Host is offline",
				});
		} else if (!activeHostUrl) {
			return t({
				message: "Host service is not running",
			});
		}
		return null;
	}, [
		isProjectPreselectionPending,
		selectedProject,
		draft.isSession,
		draft.hostId,
		machineId,
		activeHostUrl,
		selectedRemoteHostPresence,
		isCloudTargetLoading,
		resolvedEnvironment,
		t,
	]);

	const handleGoToSetup = useCallback(() => {
		if (!selectedProject?.id) return;
		const targetProjectId = selectedProject.id;
		closeModal();
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: targetProjectId },
			search: { hostId: draft.hostId ?? machineId ?? undefined },
		});
	}, [closeModal, draft.hostId, machineId, navigate, selectedProject?.id]);

	// AI naming (title + branch) follows the project's naming instructions;
	// this is the jump from "where do these names come from?" to the setting.
	const handleGoToNamingInstructions = useCallback(() => {
		if (!selectedProject?.id) return;
		const targetProjectId = selectedProject.id;
		closeModal();
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: targetProjectId },
			search: {
				hostId: draft.hostId ?? machineId ?? undefined,
				focus: "naming-instructions",
			},
		});
	}, [closeModal, draft.hostId, machineId, navigate, selectedProject?.id]);

	const handleSubmit = useCallback(() => {
		if (needsSetup) {
			handleGoToSetup();
			return;
		}
		if (submitBlocker) {
			if ((draft.hostId ?? machineId) === machineId && !activeHostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "createWorkspace",
				});
			} else {
				toast.error(submitBlocker);
			}
			return;
		}
		void createWorkspace();
	}, [
		activeHostUrl,
		createWorkspace,
		draft.hostId,
		handleGoToSetup,
		hostService,
		machineId,
		needsSetup,
		submitBlocker,
	]);

	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.repeat || e.defaultPrevented) return;
			if (!isEnterSubmit(e, { requireMod: true })) return;
			e.preventDefault();
			handleSubmit();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isOpen, handleSubmit]);

	// ── Render ───────────────────────────────────────────────────────
	return (
		<ComposerDropZone className="absolute inset-0 z-40 flex flex-col items-center overflow-y-auto bg-background">
			<PageHeader
				className="sticky top-0 z-10 w-full bg-background"
				end={
					<div className="flex items-center gap-0.5">
						{selectedProject && !needsSetup && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t({
											message: "Update naming instructions",
										})}
										className="size-7 text-muted-foreground"
										onClick={handleGoToNamingInstructions}
									>
										<Settings2Icon className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<Trans>
										Update naming instructions for {selectedProject.name}
									</Trans>
								</TooltipContent>
							</Tooltip>
						)}
						<PromptHistoryCommand
							onSelect={applyPrompt}
							tooltipLabel={t({
								message: "Previous prompts",
							})}
						>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={t({
									message: "Previous prompts",
								})}
								className="size-7 text-muted-foreground"
							>
								<HistoryIcon className="size-4" />
							</Button>
						</PromptHistoryCommand>
					</div>
				}
			/>
			<div className="flex flex-1 flex-col items-center justify-center gap-8">
				<SupersetIcon className="h-10 w-auto text-muted-foreground/70" />
				<h1 className="text-center text-3xl font-medium text-foreground/90">
					<Trans>What should we build next?</Trans>
				</h1>
				<GitHubStarPill surface="new_workspace" reserveSpace />
			</div>
			<div className="flex w-full flex-col items-center px-6 pb-8">
				<div
					className="relative flex w-full flex-col"
					style={{
						maxWidth: composerWidth ?? NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH,
					}}
				>
					<AnimatePresence initial={false}>
						{isPromptEmpty &&
							!samplePromptsPending &&
							!samplePromptsDismissed && (
								<motion.div
									key="sample-prompts"
									initial={{ opacity: 0, y: 12 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, transition: { duration: 0 } }}
									transition={{
										type: "tween",
										duration: 0.15,
										ease: "easeOut",
									}}
									// In flow, not absolute: the heading above is the flex-1
									// spacer, so it absorbs this block's height and the composer
									// stays put. Positioning it out of flow let tall suggestion
									// sets overlap the heading instead.
									className="mb-1"
								>
									<SamplePrompts
										prompts={samplePrompts}
										onSelect={applyPrompt}
										onDismiss={handleDismissSamplePrompts}
										canDismiss={hasRealWorkspace}
										tier={samplePromptTier}
									/>
								</motion.div>
							)}
					</AnimatePresence>
					<AgentComposer
						allowEmptySubmit
						autoFocus
						className="w-full"
						draft={{
							segments: draft.promptDraft,
							attachments: draft.promptAttachments,
						}}
						disabled={needsSetup}
						key={`${resetKey}-${promptSeed}-${placeholderRoll}`}
						onDraftChange={({ segments, attachments }) =>
							updateDraft({
								promptDraft: segments,
								promptAttachments: attachments,
							})
						}
						onSubmit={() => {
							handleSubmit();
							return false;
						}}
						mentionProviders={githubProviders}
						pending={isCreating}
						placeholder={promptPlaceholder}
						toolbar={
							pickerModes && (
								<ModePicker
									currentModeId={
										selectedMode ??
										startModes?.defaultModeId ??
										AGENT_DEFAULT_OPTION_ID
									}
									hiddenModeIds={startModes ? undefined : NO_HIDDEN_MODES}
									modes={pickerModes}
									onSelect={(modeId) =>
										setSelectedMode(
											modeId === AGENT_DEFAULT_OPTION_ID ||
												modeId === startModes?.defaultModeId
												? null
												: modeId,
										)
									}
								/>
							)
						}
						toolbarEnd={
							agentSwitcher && (
								<ModelPicker
									agentSwitcher={agentSwitcher}
									configOptions={launchOptions}
									onOpenChange={setModelPickerOpen}
									onSelect={selectLaunchOption}
									open={modelPickerOpen}
								/>
							)
						}
					/>
					<div className="mt-2 flex items-center justify-between gap-2">
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<DevicePicker
								hostId={draft.hostId}
								onSelectHostId={(next) => {
									setLastHostId(next);
									updateDraft({ hostId: next });
								}}
							/>
							<ProjectPickerPill
								selectedProject={selectedProject}
								projects={isCloudHost ? cloudHostProjects : projects}
								isSessionSelected={draft.isSession}
								githubRepositories={isCloudHost ? github.repositories : []}
								githubConnection={isCloudHost ? github.connection : null}
								isLoading={
									!areProjectsReady || (isCloudHost && github.isLoading)
								}
								onSelectProject={(selectedProjectId) => {
									const target = isCloudHost ? "cloud" : "device";
									if (selectedProjectId === null) {
										setLastProjectChoice(target, { kind: "none" });
										selectSession();
										return;
									}
									setLastProjectChoice(target, {
										kind: "project",
										projectId: selectedProjectId,
									});
									// A stand-in id means nothing to a device; keep the
									// device's last project for next time.
									if (
										projects.some((project) => project.id === selectedProjectId)
									)
										setLastProjectId(selectedProjectId);
									selectProject(selectedProjectId);
								}}
							/>
							{isCloudHost && (
								<EnvironmentPickerPill
									selectedEnvironment={resolvedEnvironment}
									linked={cloudSelection.linked}
									other={cloudSelection.other}
									projectName={
										draft.isSession ? undefined : selectedProject?.name
									}
									onSelectEnvironment={(environmentId) =>
										setCloudChoice(cloudChoiceKey, { environmentId })
									}
									onCreateEnvironment={() => setIsCreatingEnvironment(true)}
									onManageEnvironments={() => {
										closeModal();
										void navigate({ to: "/settings/environments" });
									}}
									isLoading={environmentsQuery.isLoading}
								/>
							)}
							{isCloudHost && (
								<MachineSizePickerPill
									machineSize={cloudSelection.machineSize}
									onSelectMachineSize={(machineSize) =>
										setCloudChoice(cloudChoiceKey, { machineSize })
									}
								/>
							)}
							{activeOrganizationId && (
								<CreateEnvironmentFlow
									onOpenChange={setIsCreatingEnvironment}
									onStarted={closeModal}
									open={isCreatingEnvironment}
									organizationId={activeOrganizationId}
									projectId={draft.isSession ? null : projectId}
								/>
							)}
							{linkedPR ? (
								<>
									<CheckoutPickerPill
										checkout="worktree"
										onSelectCheckout={() => {}}
										disabled
									/>
									<span className="flex items-center gap-1 text-xs text-muted-foreground">
										<LuGitPullRequest className="size-3 shrink-0" />
										<Trans>based off PR #{linkedPR.prNumber}</Trans>
									</span>
								</>
							) : draft.hostId === CLOUD_HOST_ID ? (
								<CompareBaseBranchPicker {...pickerProps} />
							) : draft.isSession ? null : (
								<>
									<CheckoutPickerPill
										checkout={draft.checkout}
										onSelectCheckout={(checkout) => {
											setCheckoutDefault(checkout);
											updateDraft({ checkout });
										}}
									/>
									{draft.checkout === "worktree" && (
										<CompareBaseBranchPicker
											{...pickerProps}
											onChangeProjectLocation={handleGoToSetup}
										/>
									)}
								</>
							)}
							<NoAgentToggle
								active={selectedAgent === "none"}
								onChange={(none) =>
									setSelectedAgent(
										none ? "none" : (selectableAgentIds[0] ?? "none"),
									)
								}
							/>
						</div>
						{needsSetup && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-6 px-2 text-[11px] text-amber-500 hover:text-amber-500"
								onClick={handleGoToSetup}
							>
								<Trans>Set up project…</Trans>
							</Button>
						)}
					</div>
					<SymmetricResizeHandles
						currentWidth={composerWidth ?? NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH}
						minWidth={NEW_WORKSPACE_SCREEN_MIN_WIDTH}
						maxWidth={NEW_WORKSPACE_SCREEN_MAX_WIDTH}
						onWidthChange={setLiveComposerWidth}
						onWidthCommit={(width) => {
							setStoredComposerWidth(width);
							setLiveComposerWidth(null);
						}}
						onReset={() => {
							setStoredComposerWidth(null);
							setLiveComposerWidth(null);
						}}
					/>
				</div>
			</div>
		</ComposerDropZone>
	);
}
