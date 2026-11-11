import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuChevronLeft, LuFolderGit2 } from "react-icons/lu";
import { ClickablePath } from "../../../../../../components/ClickablePath";
import { SettingsRow } from "../../../../../../components/SettingsRow";
import { SettingsSection } from "../../../../../../components/SettingsSection";
import { SparseCheckoutSection } from "../SparseCheckoutSection";

interface RepositoryProjectSettingsProps {
	projectId: string;
	parentProjectId: string;
	parentProjectName: string | null;
	name: string;
	repoPath: string;
	sparseCheckoutPaths: string[];
	hostUrl: string;
	usesConfigToml: boolean;
	scriptsEditor: ReactNode;
	onChanged: () => unknown;
}

/** Settings of one repository in a multi-repo project. */
export function RepositoryProjectSettings({
	projectId,
	parentProjectId,
	parentProjectName,
	name,
	repoPath,
	sparseCheckoutPaths,
	hostUrl,
	usesConfigToml,
	scriptsEditor,
	onChanged,
}: RepositoryProjectSettingsProps) {
	const { t } = useLingui();
	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 space-y-2">
				<Link
					to="/settings/projects/$projectId"
					params={{ projectId: parentProjectId }}
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<LuChevronLeft className="size-3.5" />
					{parentProjectName ?? <Trans>Multi-repo project</Trans>}
				</Link>
				<div className="flex min-w-0 items-center gap-3">
					<LuFolderGit2 className="size-5 shrink-0 text-muted-foreground" />
					<h2 className="truncate text-xl font-semibold">{name}</h2>
				</div>
			</header>

			<div className="space-y-10">
				<SettingsSection
					title={t({ message: "Repository" })}
					description={t({
						message:
							"Every workspace of the multi-repo project checks out this repository beside the others.",
					})}
				>
					<SettingsRow label={t({ message: "Location" })}>
						<ClickablePath path={repoPath} />
					</SettingsRow>
					<SettingsRow
						label={t({ message: "Sparse checkout" })}
						hint={t({
							message:
								"Folders to check out into new worktrees, one per line, relative to the repo root. Files at the root are always included. Empty checks out everything.",
						})}
					>
						<SparseCheckoutSection
							key={projectId}
							projectId={projectId}
							hostUrl={hostUrl}
							paths={sparseCheckoutPaths}
							onChanged={() => onChanged()}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title={
						usesConfigToml
							? t({ message: "Workspace config" })
							: t({ message: "Project lifecycle scripts" })
					}
					description={
						usesConfigToml
							? t({
									message:
										"The commands Paradev runs to set up, run and archive this repository's checkouts, from its config.toml.",
								})
							: t({
									message:
										"Commands run for this repository's setup, teardown, and the Run menu.",
								})
					}
				>
					{scriptsEditor}
				</SettingsSection>
			</div>
		</div>
	);
}
