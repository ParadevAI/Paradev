import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	type ConfigError,
	type ProjectConfig,
	parseProjectConfig,
} from "@superset/shared/project-config";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useEffect, useMemo, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CodeEditor } from "renderer/routes/_authenticated/components/CodeEditor";
import { McpAllowlistField } from "./components/McpAllowlistField";
import { PortsField } from "./components/PortsField";
import { ScriptField } from "./components/ScriptField";
import { TerminalsField } from "./components/TerminalsField";
import { PLACEHOLDERS } from "./constants";
import {
	type ConfigForm,
	configText,
	fromConfigForm,
	portProblems,
	terminalProblems,
	toConfigForm,
} from "./utils/configForm";

type Environment = RouterOutputs["environment"]["get"];

interface EditorState {
	mode: "form" | "toml";
	base: ProjectConfig;
	form: ConfigForm;
	text: string;
	errors: ConfigError[];
}

function initialState(saved: string | null): EditorState {
	const parsed = saved
		? parseProjectConfig(saved)
		: { ok: true as const, config: {} };
	const base = parsed.ok ? parsed.config : {};
	return {
		mode: parsed.ok ? "form" : "toml",
		base,
		form: toConfigForm(base),
		text: saved ?? "",
		errors: parsed.ok ? [] : parsed.errors,
	};
}

function serialize(base: ProjectConfig, form: ConfigForm): string | null {
	return configText(fromConfigForm(base, form));
}

interface EnvironmentConfigProps {
	environment: Environment;
}

export function EnvironmentConfig({ environment }: EnvironmentConfigProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const saved = environment.config;
	const [state, setState] = useState(() => initialState(saved));
	const [justSaved, setJustSaved] = useState(false);

	useEffect(
		() =>
			setState((current) => {
				const next = initialState(saved);
				return next.mode === "form" ? { ...next, mode: current.mode } : next;
			}),
		[saved],
	);

	const savedNormalized = useMemo(() => {
		const initial = initialState(saved);
		return initial.mode === "form"
			? serialize(initial.base, initial.form)
			: saved;
	}, [saved]);

	const update = cloudTrpc.environment.update.useMutation({
		onSuccess: async () => {
			await utils.environment.invalidate();
			setJustSaved(true);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	const { mode, base, form, text, errors } = state;
	const terminals = terminalProblems(form.terminals);
	const ports = portProblems(form.ports);
	const hasProblems = mode === "form" && (terminals.size > 0 || ports.size > 0);
	const draft =
		mode === "form" ? serialize(base, form) : text.trim() ? text : null;
	const changed =
		mode === "form" ? draft !== savedNormalized : text !== (saved ?? "");
	const canSave = changed && !hasProblems && !update.isPending;

	const save = () => {
		if (!canSave) return;
		setJustSaved(false);
		update.mutate({ id: environment.id, config: draft });
	};

	const editForm = (patch: Partial<ConfigForm>) => {
		setJustSaved(false);
		setState((current) => ({
			...current,
			form: { ...current.form, ...patch },
		}));
	};

	const switchMode = () => {
		if (mode === "form") {
			setState((current) => ({
				...current,
				mode: "toml",
				text: changed ? (draft ?? "") : (saved ?? ""),
				errors: [],
			}));
			return;
		}
		const parsed = text.trim()
			? parseProjectConfig(text)
			: { ok: true as const, config: {} };
		setState((current) =>
			parsed.ok
				? {
						...current,
						mode: "form",
						base: parsed.config,
						form: toConfigForm(parsed.config),
						errors: [],
					}
				: { ...current, errors: parsed.errors },
		);
	};

	return (
		<div>
			<div className="mb-1 flex items-center justify-between gap-4">
				<span className="text-xs font-medium">
					<Trans>Config</Trans>
				</span>
				<div className="flex items-center gap-1.5">
					<Button onClick={switchMode} size="xs" variant="ghost">
						{mode === "form" ? (
							<Trans>Edit as TOML</Trans>
						) : (
							<Trans>Edit as form</Trans>
						)}
					</Button>
					<Button disabled={!canSave} onClick={save} size="xs">
						{update.isPending ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
					</Button>
				</div>
			</div>
			<p className="mb-2 text-xs text-muted-foreground">
				<Trans>
					What this environment's builds and cloud workspaces run. Without one,
					the cloud reads the primary repository's .paradev/config.toml.
				</Trans>
			</p>
			{mode === "form" ? (
				<div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70">
					<ScriptField
						ariaLabel={t({ message: "Install script" })}
						description={
							<Trans>
								Runs as a bash script when the environment builds. New
								workspaces start from the result.
							</Trans>
						}
						fileName="install.sh"
						label={<Trans>Install script</Trans>}
						notice={
							form.install.trim() || draft === null ? null : (
								<p className="text-xs text-amber-600 dark:text-amber-500">
									<Trans>Builds fail until there is an install script.</Trans>
								</p>
							)
						}
						onChange={(install) => editForm({ install })}
						onSave={save}
						placeholder={PLACEHOLDERS.install}
						value={form.install}
					/>
					<ScriptField
						ariaLabel={t({ message: "Start script" })}
						description={
							<Trans>
								Runs as a bash script in each new cloud workspace before agents
								start.
							</Trans>
						}
						fileName="start.sh"
						label={<Trans>Start script</Trans>}
						onChange={(start) => editForm({ start })}
						onSave={save}
						placeholder={PLACEHOLDERS.start}
						value={form.start}
					/>
					<TerminalsField
						onChange={(rows) => editForm({ terminals: rows })}
						problems={terminals}
						rows={form.terminals}
					/>
					<PortsField
						onChange={(rows) => editForm({ ports: rows })}
						problems={ports}
						rows={form.ports}
					/>
					<McpAllowlistField
						enabled={form.mcpEnabled}
						onChange={(mcpAllow) => editForm({ mcpAllow })}
						onEnabledChange={(mcpEnabled) => editForm({ mcpEnabled })}
						value={form.mcpAllow}
					/>
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<div className="h-96 overflow-hidden rounded-lg border border-border/70">
						<CodeEditor
							ariaLabel={t({ message: "Config" })}
							filePath="config.toml"
							language="toml"
							onChange={(next) => {
								setJustSaved(false);
								setState((current) => ({ ...current, text: next }));
							}}
							onSave={save}
							value={text}
						/>
					</div>
					{errors.map((error) => (
						<p
							className="text-xs text-destructive"
							key={`${error.line ?? 0}:${error.message}`}
						>
							{error.line ? (
								<Trans>
									Line {error.line}: {error.message}
								</Trans>
							) : (
								error.message
							)}
						</p>
					))}
				</div>
			)}
			{justSaved && !changed && (
				<p className="mt-1.5 text-xs text-muted-foreground">
					<Trans>
						Saved. New workspaces and the next build use it; running workspaces
						pick it up when they restart.
					</Trans>
				</p>
			)}
		</div>
	);
}
