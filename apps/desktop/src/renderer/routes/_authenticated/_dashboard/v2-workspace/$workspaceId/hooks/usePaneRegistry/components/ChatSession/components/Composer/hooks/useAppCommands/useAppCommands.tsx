import type { I18n } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type {
	AvailableCommand,
	SessionConfigOption,
} from "@superset/chat/protocol";
import type {
	ComposerActionContext,
	PromptInputCommand,
	PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import { COMPANY } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { type RefObject, useCallback, useMemo, useState } from "react";
import { useCreateAutomation } from "renderer/routes/_authenticated/_dashboard/hooks/useCreateAutomation";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { fastOption } from "renderer/routes/_authenticated/components/AgentComposer/utils/toggleOption";
import type { ChatForkTarget } from "../../../../types";
import { commandChip } from "../../../../utils/commandChip";
import {
	APP_COMMANDS,
	type AppCommand,
	type AppCommandContext,
} from "../../utils/appCommands";
import { splitInvocation } from "../../utils/commandArgs";
import { resolveCollisions } from "../../utils/commandCollisions";
import { PLAN_ID, type PlanSwitch, planControl } from "../../utils/planControl";
import { restoreCommand } from "../../utils/restoreCommand";

export type TypedCommandOutcome = "not-app" | "ran" | "kept";

function hintText(command: AppCommand, i18n: I18n): string | undefined {
	if (typeof command.hint === "string") return command.hint;
	return command.hint && i18n._(command.hint);
}

export type UseAppCommandsOptions = {
	inputRef: RefObject<PromptInputHandle | null>;
	availableCommands: AvailableCommand[];
	presetId?: string;
	configOptions?: SessionConfigOption[];
	onSetConfigOption?: (configId: string, value: string) => unknown;
	modes?: { id: string }[];
	currentModeId?: string;
	onSetMode?: (modeId: string) => void;
	openModelPicker?: () => void;
	onNewChat?: () => void;
	onFork?: (target: ChatForkTarget) => void;
	canForkToWorktree?: boolean;
	onOpenHistory?: () => void;
	onOpenFind?: () => void;
	openStatus?: () => void;
	openMcp?: (composer: ComposerActionContext) => void;
	/** Writing to a subagent: only commands about the message itself apply. */
	toSubagent: boolean;
};

export function useAppCommands({
	inputRef,
	availableCommands,
	presetId,
	configOptions,
	onSetConfigOption,
	modes,
	currentModeId,
	onSetMode,
	openModelPicker,
	onNewChat,
	onFork,
	canForkToWorktree,
	onOpenHistory,
	onOpenFind,
	openStatus,
	openMcp,
	toSubagent,
}: UseAppCommandsOptions): {
	commands: PromptInputCommand[];
	hiddenAgentNames: ReadonlySet<string>;
	runTyped: (text: string, withAttachments: boolean) => TypedCommandOutcome;
} {
	const { t, i18n } = useLingui();
	const { workspace } = useWorkspace();
	const { create: createAutomation } = useCreateAutomation();
	const projectId = workspace.projectId;

	const [modeBeforePlan, setModeBeforePlan] = useState(currentModeId);
	if (
		currentModeId &&
		currentModeId !== PLAN_ID &&
		currentModeId !== modeBeforePlan
	) {
		setModeBeforePlan(currentModeId);
	}

	const context = useMemo<AppCommandContext>(() => {
		const leaveComposer = (action: () => void) => () =>
			queueMicrotask(() => {
				inputRef.current?.blur();
				action();
			});
		const mcp = openMcp
			? {
					openMcp: (composer: ComposerActionContext) =>
						queueMicrotask(() => openMcp(composer)),
				}
			: {};
		if (toSubagent) return mcp;
		const fast = fastOption(configOptions ?? []);
		const plan = planControl({
			configOptions: configOptions ?? [],
			modes: modes ?? [],
			currentModeId,
			modeBeforePlan,
		});
		const apply = (change: PlanSwitch) => {
			if ("modeId" in change) onSetMode?.(change.modeId);
			else onSetConfigOption?.(change.configId, change.value);
		};
		return {
			...mcp,
			...(onNewChat ? { newChat: onNewChat } : {}),
			...(openModelPicker
				? { openModelPicker: leaveComposer(openModelPicker) }
				: {}),
			...(fast && onSetConfigOption
				? {
						fast: {
							on: fast.currentValue === "on",
							set: (on: boolean) => {
								onSetConfigOption(fast.id, on ? "on" : "off");
								toast.success(
									on
										? t({ message: "Fast mode on" })
										: t({ message: "Fast mode off" }),
								);
							},
						},
					}
				: {}),
			...(plan && ("modeId" in plan.enter ? onSetMode : onSetConfigOption)
				? {
						plan: {
							active: plan.active,
							enter: () => apply(plan.enter),
							leave: () => apply(plan.leave),
						},
					}
				: {}),
			...(onFork
				? {
						fork: {
							targets: canForkToWorktree
								? (["workspace", "worktree"] as const)
								: (["workspace"] as const),
							run: onFork,
						},
					}
				: {}),
			...(onOpenHistory ? { openHistory: leaveComposer(onOpenHistory) } : {}),
			...(onOpenFind ? { openFind: leaveComposer(onOpenFind) } : {}),
			...(openStatus ? { openStatus: leaveComposer(openStatus) } : {}),
			createAutomation: (prompt: string) => {
				void createAutomation({
					prompt,
					...(presetId ? { agent: presetId } : {}),
					projectId,
				}).then((created) => {
					if (created) return;
					restoreCommand(inputRef, `/automation ${prompt}`.trim(), (restore) =>
						toast(
							t({
								message: "Add the /automation prompt back to your message?",
							}),
							{
								action: { label: t({ message: "Add back" }), onClick: restore },
								duration: 15_000,
							},
						),
					);
				});
			},
		};
	}, [
		canForkToWorktree,
		configOptions,
		createAutomation,
		currentModeId,
		inputRef,
		modeBeforePlan,
		modes,
		onFork,
		onNewChat,
		onOpenFind,
		onOpenHistory,
		onSetConfigOption,
		onSetMode,
		openMcp,
		openModelPicker,
		openStatus,
		presetId,
		projectId,
		t,
		toSubagent,
	]);

	const resolved = useMemo(
		() =>
			resolveCollisions(
				APP_COMMANDS.filter((command) => command.available(context)),
				availableCommands.map((command) => command.name),
			),
		[availableCommands, context],
	);

	const run = useCallback(
		(
			command: AppCommand,
			args: string,
			composer: ComposerActionContext,
		): boolean => {
			if (command.run(context, args, composer) === "done") return true;
			const name = command.name;
			const hint = hintText(command, i18n);
			toast.error(
				hint
					? t({ message: `Usage: /${name} ${hint}` })
					: t({ message: `/${name} doesn't take arguments` }),
			);
			return false;
		},
		[context, i18n, t],
	);

	const commands = useMemo<PromptInputCommand[]>(
		() =>
			resolved.app.flatMap(({ command, aliases }) => {
				if (command.listed && !command.listed(context)) return [];
				const Icon = command.icon;
				const row = {
					title: `/${command.name}`,
					icon: <Icon className="size-3.5" />,
					group: COMPANY.NAME,
					searchAliases: aliases,
				};
				const choices = command.choices?.(context) ?? [];
				if (choices.length > 0) {
					return choices.map((choice) => ({
						...row,
						id: `app:${command.name}:${choice.arg}`,
						hint: choice.arg,
						description: i18n._(choice.description),
						completion: commandChip(`${command.name} ${choice.arg}`),
						onSelect: (composer: ComposerActionContext) => {
							run(command, choice.arg, composer);
						},
					}));
				}
				const description = i18n._(command.description);
				const hint = hintText(command, i18n);
				const completion = commandChip(command.name, description);
				return [
					{
						...row,
						id: `app:${command.name}`,
						...(hint ? { hint } : {}),
						description,
						completion,
						onSelect: (composer: ComposerActionContext) => {
							if (command.takesText) composer.insertChip(completion);
							else run(command, "", composer);
						},
					},
				];
			}),
		[context, i18n, resolved, run],
	);

	const runTyped = useCallback(
		(text: string, withAttachments: boolean): TypedCommandOutcome => {
			const invocation = splitInvocation(text);
			const input = inputRef.current;
			if (!invocation || !input) return "not-app";
			const entry = resolved.app.find(
				({ command, aliases }) =>
					command.name === invocation.name || aliases.includes(invocation.name),
			);
			if (!entry) return "not-app";
			if (withAttachments) {
				const name = entry.command.name;
				toast.error(t({ message: `/${name} doesn't take attachments` }));
				return "kept";
			}
			const composer: ComposerActionContext = {
				insertChip: input.insertChip,
				attachFiles: input.openFileDialog,
				openPanel: input.openPanel,
				query: "",
			};
			return run(entry.command, invocation.args, composer) ? "ran" : "kept";
		},
		[inputRef, resolved, run, t],
	);

	return {
		commands,
		hiddenAgentNames: resolved.hiddenAgentNames,
		runTyped,
	};
}
