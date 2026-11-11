import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	V2TerminalPresetRow,
	WorkspaceRunTerminalState,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { selectWorkspaceRunDefinition } from "shared/workspace-run-definition";
import type { StoreApi } from "zustand/vanilla";
import { useWorkspaceRepositories } from "../../state/activeRepositoryStore";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

const CTRL_C_INPUT = "\u0003";
const TERMINAL_GONE_ERROR_MESSAGES = [
	"Terminal session not found",
	"Terminal session has exited",
	"Terminal session does not belong to this workspace",
] as const;

function isTerminalGoneError(error: unknown): boolean {
	// Matches server wording, so it must see the raw English message — the
	// translated display string would break this under any other locale.
	const message = rawErrorMessage(error);
	return TERMINAL_GONE_ERROR_MESSAGES.some((terminalMessage) =>
		message.includes(terminalMessage),
	);
}

function markStopped(
	state: WorkspaceRunTerminalState,
	stoppedAt: number,
	overrides?: Partial<
		Pick<WorkspaceRunTerminalState, "exitCode" | "signal" | "state">
	>,
) {
	state.state =
		overrides?.state ??
		(state.stopRequestedAt ? "stopped-by-user" : "stopped-by-exit");
	state.stoppedAt = stoppedAt;
	if (overrides?.exitCode !== undefined) state.exitCode = overrides.exitCode;
	if (overrides?.signal !== undefined) state.signal = overrides.signal;
}

function makeTerminalPane(
	terminalId: string,
	paneId: string,
	title?: string,
): CreatePaneInput<PaneViewerData> {
	return {
		id: paneId,
		kind: "terminal",
		titleOverride:
			title ??
			i18n._(
				msg({
					message: "Workspace Run",
				}),
			),
		data: { terminalId } as TerminalPaneData,
	};
}

function getDefinitionId(
	definition: ReturnType<typeof selectWorkspaceRunDefinition>,
): string | undefined {
	if (!definition) return undefined;
	return definition.source === "terminal-preset"
		? definition.presetId
		: definition.projectId;
}

/** One repository's run in a multi-repo workspace. */
export interface RepositoryRun {
	id: string;
	name: string;
	projectId: string | null;
	/** Null when the repository has no run script. */
	commands: string[] | null;
	cwd: string | null;
	runningState: WorkspaceRunTerminalState | null;
}

interface LaunchRunArgs {
	command: string;
	cwd?: string;
	definitionSource: WorkspaceRunTerminalState["definitionSource"];
	definitionId?: string;
	repositoryId?: string;
	title?: string;
}

interface UseV2WorkspaceRunArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
	matchedPresets: V2TerminalPresetRow[];
	resolvePresetCommands: (preset: V2TerminalPresetRow) => string[];
}

export function useV2WorkspaceRun({
	store,
	launcher,
	matchedPresets,
	resolvePresetCommands,
}: UseV2WorkspaceRunArgs) {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const projectId = workspace.projectId;
	const collections = useCollections();
	const [isPending, setIsPending] = useState(false);
	const isStartingRef = useRef(false);
	const utils = workspaceTrpc.useUtils();
	const writeInputMutation = workspaceTrpc.terminal.writeInput.useMutation();
	const killSessionMutation = workspaceTrpc.terminal.killSession.useMutation();
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const localWorkspaceState = localWorkspaceRows[0] ?? null;
	const workspaceRunTerminals = useMemo(
		() => localWorkspaceState?.workspaceRunTerminals ?? {},
		[localWorkspaceState?.workspaceRunTerminals],
	);

	const repositories = useWorkspaceRepositories(workspaceId);
	const isMultiRepo = repositories.length > 1;

	// Session workspaces (null projectId) have no project config; only global
	// terminal presets can define their run.
	const { data: configRunDefinition } =
		workspaceTrpc.config.getWorkspaceRunDefinition.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: projectId !== null && !isMultiRepo },
		);

	const hostTarget = useWorkspaceHostTarget(workspaceId);
	const isSandbox =
		hostTarget.status === "ready" && hostTarget.kind === "sandbox";
	const isBootRunHost = isSandbox && Boolean(configRunDefinition);
	const { data: sandboxStatus } = workspaceTrpc.sandbox.status.useQuery(
		undefined,
		{ enabled: isBootRunHost },
	);
	const bootRunTerminalId = sandboxStatus?.runTerminalId ?? null;
	const { data: bootRunProcess } =
		workspaceTrpc.terminal.hasRunningProcess.useQuery(
			{ terminalId: bootRunTerminalId ?? "", workspaceId },
			{ enabled: bootRunTerminalId !== null },
		);

	const resolvedMatchedPresets = useMemo(
		() =>
			matchedPresets.map((preset) => ({
				...preset,
				commands: resolvePresetCommands(preset),
			})),
		[matchedPresets, resolvePresetCommands],
	);

	const definition = useMemo(
		() =>
			selectWorkspaceRunDefinition({
				presets: resolvedMatchedPresets,
				configRunCommands: configRunDefinition?.commands,
				configCwd: configRunDefinition?.cwd,
				projectId,
			}),
		[
			configRunDefinition?.commands,
			configRunDefinition?.cwd,
			projectId,
			resolvedMatchedPresets,
		],
	);

	const runningStates = useMemo(
		() =>
			Object.values(workspaceRunTerminals)
				.filter((state) => state.state === "running")
				.sort((a, b) => b.startedAt - a.startedAt),
		[workspaceRunTerminals],
	);
	const runningState = runningStates[0] ?? null;

	const { data: repositoryDefinitions } =
		workspaceTrpc.config.getRepositoryRunDefinitions.useQuery(
			{ workspaceId },
			{ enabled: isMultiRepo },
		);
	const repositoryRuns = useMemo<RepositoryRun[]>(
		() =>
			isMultiRepo
				? repositories.map((repository) => {
						const repositoryDefinition = repositoryDefinitions?.find(
							(entry) => entry.repositoryId === repository.id,
						);
						return {
							id: repository.id,
							name: repository.name,
							projectId: repositoryDefinition?.projectId ?? null,
							commands: repositoryDefinition?.commands ?? null,
							cwd: repositoryDefinition?.cwd ?? null,
							runningState:
								runningStates.find(
									(state) => state.repositoryId === repository.id,
								) ?? null,
						};
					})
				: [],
		[isMultiRepo, repositories, repositoryDefinitions, runningStates],
	);

	const updateWorkspaceRunTerminals = useCallback(
		(updater: (states: Record<string, WorkspaceRunTerminalState>) => void) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.workspaceRunTerminals ??= {};
				updater(draft.workspaceRunTerminals);
			});
		},
		[collections.v2WorkspaceLocalState, workspaceId],
	);

	const bootRunCommand = buildTerminalCommand(configRunDefinition?.commands);
	const adoptBootRun = useCallback(
		(terminalId: string) => {
			if (!projectId) return;
			updateWorkspaceRunTerminals((states) => {
				states[terminalId] ??= {
					terminalId,
					workspaceId,
					state: "running",
					command: bootRunCommand ?? "",
					definitionSource: "project-config",
					definitionId: projectId,
					startedAt: Date.now(),
				};
			});
		},
		[bootRunCommand, projectId, updateWorkspaceRunTerminals, workspaceId],
	);

	const isBootRunLive = bootRunProcess?.running === true;
	useEffect(() => {
		if (!isBootRunLive || !bootRunTerminalId) return;
		if (workspaceRunTerminals[bootRunTerminalId]) return;
		adoptBootRun(bootRunTerminalId);
	}, [adoptBootRun, bootRunTerminalId, isBootRunLive, workspaceRunTerminals]);

	const findLiveBootRun = useCallback(async (): Promise<string | null> => {
		if (!isBootRunHost) return null;
		try {
			const status = await utils.sandbox.status.fetch(undefined, {
				staleTime: 0,
			});
			const terminalId = status.runTerminalId;
			if (!terminalId || workspaceRunTerminals[terminalId]) return null;
			const { running } = await utils.terminal.hasRunningProcess.fetch(
				{ terminalId, workspaceId },
				{ staleTime: 0 },
			);
			return running ? terminalId : null;
		} catch (error) {
			console.warn("[workspace-run] could not read the boot run", error);
			return null;
		}
	}, [isBootRunHost, utils, workspaceId, workspaceRunTerminals]);

	const focusTerminalPane = useCallback(
		(terminalId: string) => {
			const state = store.getState();
			for (const tab of state.tabs) {
				for (const [paneId, pane] of Object.entries(tab.panes)) {
					if (pane.kind !== "terminal") continue;
					if ((pane.data as TerminalPaneData).terminalId !== terminalId)
						continue;
					state.setActivePane({ tabId: tab.id, paneId });
					state.setActiveTab(tab.id);
					return;
				}
			}
			state.addTab({
				id: crypto.randomUUID(),
				panes: [makeTerminalPane(terminalId, crypto.randomUUID())],
			});
		},
		[store],
	);

	const launchRun = useCallback(
		async ({
			command,
			cwd,
			definitionSource,
			definitionId,
			repositoryId,
			title,
		}: LaunchRunArgs) => {
			// A terminal pane is a run pane iff its terminalId is in
			// workspaceRunTerminals; a repository's run reuses only its own panes.
			// Snapshot before launch so the new terminal doesn't itself match.
			const priorRunTerminalIds = new Set(
				Object.values(workspaceRunTerminals)
					.filter((state) => state.repositoryId === repositoryId)
					.map((state) => state.terminalId),
			);
			try {
				const { sessions } = await utils.terminal.list.fetch(
					{ workspaceId },
					{ staleTime: 0 },
				);
				await Promise.allSettled(
					sessions
						.filter((session) => priorRunTerminalIds.has(session.terminalId))
						.map((session) =>
							killSessionMutation.mutateAsync({
								terminalId: session.terminalId,
								workspaceId,
							}),
						),
				);
			} catch (error) {
				console.warn(
					"[workspace-run] could not end earlier run terminals",
					error,
				);
			}

			const terminalId = await launcher.create({ command, cwd });
			const startedAt = Date.now();
			updateWorkspaceRunTerminals((states) => {
				states[terminalId] = {
					terminalId,
					workspaceId,
					state: "running",
					command,
					definitionSource,
					definitionId,
					startedAt,
					...(repositoryId && { repositoryId }),
				};
			});

			const state = store.getState();
			let reused: { tabId: string; paneId: string } | null = null;
			for (let i = state.tabs.length - 1; i >= 0; i--) {
				const tab = state.tabs[i];
				if (!tab) continue;
				for (const [paneId, pane] of Object.entries(tab.panes)) {
					if (pane.kind !== "terminal") continue;
					const paneTerminalId = (pane.data as TerminalPaneData).terminalId;
					if (paneTerminalId && priorRunTerminalIds.has(paneTerminalId)) {
						reused = { tabId: tab.id, paneId };
						break;
					}
				}
				if (reused) break;
			}

			if (reused) {
				const nextData: TerminalPaneData = { terminalId };
				state.setPaneData({ paneId: reused.paneId, data: nextData });
				state.setActivePane({
					tabId: reused.tabId,
					paneId: reused.paneId,
				});
				state.setActiveTab(reused.tabId);
			} else {
				const tabId = crypto.randomUUID();
				const paneId = crypto.randomUUID();
				const pane = makeTerminalPane(terminalId, paneId, title);
				state.addTab({ id: tabId, panes: [pane] });
			}
		},
		[
			killSessionMutation,
			launcher,
			store,
			updateWorkspaceRunTerminals,
			utils,
			workspaceId,
			workspaceRunTerminals,
		],
	);

	const reportLaunchError = useCallback(
		(error: unknown) => {
			toast.error(
				t({
					message: "Failed to run workspace command",
				}),
				{
					description: errorMessage(
						error,
						t({
							message: "Unknown error",
						}),
					),
				},
			);
		},
		[t],
	);

	const startWorkspaceRun = useCallback(async () => {
		if (isStartingRef.current) return;
		const command = buildTerminalCommand(definition?.commands);
		if (!definition || !command) {
			toast.error(
				t({
					message: "No workspace run command configured",
				}),
				{
					description: t({
						message:
							"Add a lifecycle run script in Project Settings or mark a terminal script as the workspace run.",
					}),
				},
			);
			return;
		}

		isStartingRef.current = true;
		setIsPending(true);
		try {
			if (definition.source === "project-config") {
				const bootRunId = await findLiveBootRun();
				if (bootRunId) {
					adoptBootRun(bootRunId);
					focusTerminalPane(bootRunId);
					return;
				}
			}

			await launchRun({
				command,
				cwd: definition.cwd,
				definitionSource: definition.source,
				definitionId: getDefinitionId(definition),
			});
		} catch (error) {
			reportLaunchError(error);
		} finally {
			isStartingRef.current = false;
			setIsPending(false);
		}
	}, [
		adoptBootRun,
		definition,
		findLiveBootRun,
		focusTerminalPane,
		launchRun,
		reportLaunchError,
		t,
	]);

	const startRepositoryRuns = useCallback(
		async (runs: RepositoryRun[]) => {
			if (isStartingRef.current) return;
			isStartingRef.current = true;
			setIsPending(true);
			try {
				for (const run of runs) {
					const command = buildTerminalCommand(run.commands ?? undefined);
					if (!command || run.runningState) continue;
					const repositoryName = run.name;
					try {
						await launchRun({
							command,
							cwd: run.cwd ?? undefined,
							definitionSource: "project-config",
							definitionId: run.id,
							repositoryId: run.id,
							title: t({ message: `Run: ${repositoryName}` }),
						});
					} catch (error) {
						reportLaunchError(error);
					}
				}
			} finally {
				isStartingRef.current = false;
				setIsPending(false);
			}
		},
		[launchRun, reportLaunchError, t],
	);

	const stopRun = useCallback(
		async (target: WorkspaceRunTerminalState) => {
			try {
				const stopRequestedAt = Date.now();
				await writeInputMutation.mutateAsync({
					terminalId: target.terminalId,
					workspaceId,
					data: CTRL_C_INPUT,
				});
				const stoppedAt = Date.now();
				updateWorkspaceRunTerminals((states) => {
					const state = states[target.terminalId];
					if (!state || state.state !== "running") return;
					state.stopRequestedAt = stopRequestedAt;
					markStopped(state, stoppedAt, { state: "stopped-by-user" });
				});
			} catch (error) {
				if (isTerminalGoneError(error)) {
					const stoppedAt = Date.now();
					updateWorkspaceRunTerminals((states) => {
						const state = states[target.terminalId];
						if (!state || state.state !== "running") return;
						markStopped(state, stoppedAt);
					});
					return;
				}

				updateWorkspaceRunTerminals((states) => {
					const state = states[target.terminalId];
					if (!state || state.state !== "running") return;
					delete state.stopRequestedAt;
				});
				toast.error(
					t({
						message: "Failed to stop workspace run command",
					}),
					{
						description: errorMessage(
							error,
							t({
								message: "Unknown error",
							}),
						),
					},
				);
			}
		},
		[t, updateWorkspaceRunTerminals, workspaceId, writeInputMutation],
	);

	// A multi-repo workspace's Run covers every repository's run.
	const stopTargets = useMemo(
		() => (isMultiRepo ? runningStates : runningState ? [runningState] : []),
		[isMultiRepo, runningState, runningStates],
	);

	const stopWorkspaceRun = useCallback(async () => {
		if (stopTargets.length === 0) return;
		setIsPending(true);
		try {
			await Promise.all(stopTargets.map(stopRun));
		} finally {
			setIsPending(false);
		}
	}, [stopRun, stopTargets]);

	const forceStopRun = useCallback(
		async (target: WorkspaceRunTerminalState) => {
			try {
				await killSessionMutation.mutateAsync({
					terminalId: target.terminalId,
					workspaceId,
				});
				const stoppedAt = Date.now();
				updateWorkspaceRunTerminals((states) => {
					const state = states[target.terminalId];
					if (!state) return;
					state.stopRequestedAt ??= stoppedAt;
					markStopped(state, stoppedAt, { state: "stopped-by-user" });
				});
			} catch (error) {
				if (isTerminalGoneError(error)) {
					const stoppedAt = Date.now();
					updateWorkspaceRunTerminals((states) => {
						const state = states[target.terminalId];
						if (!state || state.state !== "running") return;
						markStopped(state, stoppedAt);
					});
					return;
				}

				toast.error(
					t({
						message: "Failed to force stop workspace run command",
					}),
					{
						description: errorMessage(
							error,
							t({
								message: "Unknown error",
							}),
						),
					},
				);
			}
		},
		[killSessionMutation, t, updateWorkspaceRunTerminals, workspaceId],
	);

	const forceStopWorkspaceRun = useCallback(async () => {
		if (stopTargets.length === 0) return;
		setIsPending(true);
		try {
			await Promise.all(stopTargets.map(forceStopRun));
			await utils.terminal.list.invalidate({ workspaceId });
		} finally {
			setIsPending(false);
		}
	}, [forceStopRun, stopTargets, utils, workspaceId]);

	const toggleWorkspaceRun = useCallback(async () => {
		if (stopTargets.length > 0) {
			await stopWorkspaceRun();
			return;
		}
		if (isMultiRepo) {
			await startRepositoryRuns(repositoryRuns);
			return;
		}
		await startWorkspaceRun();
	}, [
		isMultiRepo,
		repositoryRuns,
		startRepositoryRuns,
		startWorkspaceRun,
		stopTargets,
		stopWorkspaceRun,
	]);

	const startRepositoryRun = useCallback(
		(repositoryId: string) =>
			startRepositoryRuns(
				repositoryRuns.filter((run) => run.id === repositoryId),
			),
		[repositoryRuns, startRepositoryRuns],
	);

	const runAll = useCallback(
		() => startRepositoryRuns(repositoryRuns),
		[repositoryRuns, startRepositoryRuns],
	);

	const stopRepositoryRun = useCallback(
		async (repositoryId: string) => {
			const target = repositoryRuns.find(
				(run) => run.id === repositoryId,
			)?.runningState;
			if (!target) return;
			setIsPending(true);
			try {
				await stopRun(target);
			} finally {
				setIsPending(false);
			}
		},
		[repositoryRuns, stopRun],
	);

	useWorkspaceEvent("terminal:lifecycle", workspaceId, (payload) => {
		if (payload.eventType !== "exit") return;
		updateWorkspaceRunTerminals((states) => {
			const state = states[payload.terminalId];
			if (!state || state.state !== "running") return;
			markStopped(state, payload.occurredAt, {
				exitCode: payload.exitCode,
				signal: payload.signal,
			});
		});
	});

	return {
		canForceStop: stopTargets.length > 0,
		definition,
		forceStopWorkspaceRun,
		isPending,
		hasRunCommand: isMultiRepo
			? repositoryRuns.some((run) => (run.commands ?? []).length > 0)
			: (definition?.commands ?? []).length > 0,
		isRunning: stopTargets.length > 0,
		repositoryRuns,
		runAll,
		runningState,
		startRepositoryRun,
		stopRepositoryRun,
		stopWorkspaceRun,
		toggleWorkspaceRun,
	};
}
