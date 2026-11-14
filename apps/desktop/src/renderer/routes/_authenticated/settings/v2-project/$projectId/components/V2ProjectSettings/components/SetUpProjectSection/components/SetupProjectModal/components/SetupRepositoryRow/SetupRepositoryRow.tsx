import { Trans, useLingui } from "@lingui/react/macro";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import type { RepositoryChoice } from "../../utils/buildSetupInput";
import { PathField } from "../PathField";

interface SetupRepositoryRowProps {
	repository: { id: string; name: string; url: string | null };
	choice: RepositoryChoice;
	onChange: (choice: RepositoryChoice) => void;
	onBrowse: () => void;
	pathPlaceholder: string;
	disabled: boolean;
}

export function SetupRepositoryRow({
	repository,
	choice,
	onChange,
	onBrowse,
	pathPlaceholder,
	disabled,
}: SetupRepositoryRowProps) {
	const { t } = useLingui();
	return (
		<div className="flex flex-col gap-1.5 rounded-md border p-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium" title={repository.name}>
						{repository.name}
					</div>
					<div
						className="truncate font-mono text-xs text-muted-foreground select-text cursor-text"
						title={repository.url ?? undefined}
					>
						{repository.url ?? <Trans>No remote</Trans>}
					</div>
				</div>
				<ToggleGroup
					type="single"
					value={choice.kind}
					onValueChange={(value) => {
						if (value === "clone") onChange({ kind: "clone" });
						if (value === "import") onChange({ kind: "import", path: "" });
					}}
					variant="outline"
					size="sm"
					disabled={disabled}
					className="shrink-0"
					aria-label={t({ message: `Where ${repository.name} comes from` })}
				>
					<ToggleGroupItem value="clone" disabled={!repository.url}>
						<Trans>Clone</Trans>
					</ToggleGroupItem>
					<ToggleGroupItem value="import">
						<Trans>Use an existing folder</Trans>
					</ToggleGroupItem>
				</ToggleGroup>
			</div>
			{choice.kind === "import" && (
				<PathField
					id={`setup-path-${repository.id}`}
					value={choice.path}
					onChange={(path) => onChange({ kind: "import", path })}
					onBrowse={onBrowse}
					placeholder={pathPlaceholder}
					disabled={disabled}
				/>
			)}
		</div>
	);
}
