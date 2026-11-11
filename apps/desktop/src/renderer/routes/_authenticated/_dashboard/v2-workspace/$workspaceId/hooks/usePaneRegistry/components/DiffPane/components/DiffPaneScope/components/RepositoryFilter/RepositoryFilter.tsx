import { Plural, Trans } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuChevronDown, LuFolderGit2 } from "react-icons/lu";

interface RepositoryFilterProps {
	repositories: Array<{ id: string; name: string }>;
	shown: Set<string>;
	onChange: (repositoryIds: string[]) => void;
}

/** Picks which repositories a multi-repo diff shows; none picked shows all. */
export function RepositoryFilter({
	repositories,
	shown,
	onChange,
}: RepositoryFilterProps) {
	const repositoryCount = repositories.length;
	const shownCount = shown.size;
	const showsAll = shownCount === repositoryCount;
	const onlyShown =
		shownCount === 1
			? repositories.find((repository) => shown.has(repository.id))
			: undefined;

	const toggle = (repositoryId: string) => {
		const next = showsAll
			? [repositoryId]
			: shown.has(repositoryId)
				? [...shown].filter((id) => id !== repositoryId)
				: [...shown, repositoryId];
		onChange(next.length === repositories.length ? [] : next);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
				<LuFolderGit2 className="size-3.5 shrink-0" />
				<span className="truncate">
					{showsAll ? (
						<Plural
							value={repositoryCount}
							one="# repository"
							other="All # repositories"
						/>
					) : onlyShown ? (
						onlyShown.name
					) : (
						<Plural
							value={shownCount}
							one="# repository"
							other="# repositories"
						/>
					)}
				</span>
				<LuChevronDown className="size-3 shrink-0" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-48">
				<DropdownMenuCheckboxItem
					checked={showsAll}
					onSelect={(event) => event.preventDefault()}
					onCheckedChange={() => onChange([])}
				>
					<Trans>All repositories</Trans>
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				{repositories.map((repository) => (
					<DropdownMenuCheckboxItem
						key={repository.id}
						checked={!showsAll && shown.has(repository.id)}
						onSelect={(event) => event.preventDefault()}
						onCheckedChange={() => toggle(repository.id)}
					>
						{repository.name}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
