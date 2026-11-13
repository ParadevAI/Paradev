import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { IconType } from "react-icons";
import {
	HiCheck,
	HiChevronDown,
	HiOutlineEye,
	HiOutlineUserCircle,
} from "react-icons/hi2";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import {
	normalizeGithubLogin,
	normalizeGithubLogins,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/normalizeGithubLogins";

export type PullRequestUserFilterKind = "author" | "reviewer";

const MAX_SELECTED = 20;

interface PullRequestUserFilterProps {
	kind: PullRequestUserFilterKind;
	value: string | null;
	onChange: (value: string | null) => void;
	/** Scoped to a single repo, this drives a live contributor list instead
	 *  of a bare text box — "all repositories" or multiple selected repos
	 *  have no single contributor set to show. */
	projectTargets: ProjectQueryTarget[];
}

export function PullRequestUserFilter({
	kind,
	value,
	onChange,
	projectTargets,
}: PullRequestUserFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const selected = useMemo(() => value?.split(",") ?? [], [value]);
	const isSelected = (login: string) =>
		selected.some((entry) => entry.toLowerCase() === login.toLowerCase());

	const copy: {
		icon: IconType;
		emptyLabel: string;
		triggerLabel: (label: string) => string;
		scopedPlaceholder: string;
		noneFound: string;
	} =
		kind === "author"
			? {
					icon: HiOutlineUserCircle,
					emptyLabel: t({
						message: "All authors",
					}),
					triggerLabel: (label) =>
						t({
							message: `Author: ${label}`,
						}),
					scopedPlaceholder: t({
						message: "Search authors…",
					}),
					noneFound: t({
						message: "No authors found.",
					}),
				}
			: {
					icon: HiOutlineEye,
					emptyLabel: t({
						message: "Any reviewer",
					}),
					triggerLabel: (label) =>
						t({
							message: `Reviewer: ${label}`,
						}),
					scopedPlaceholder: t({
						message: "Search reviewers…",
					}),
					noneFound: t({
						message: "No reviewers found.",
					}),
				};
	const Icon = copy.icon;
	const label = value
		? selected.map((login) => `@${login}`).join(", ")
		: copy.emptyLabel;

	const singleTarget =
		projectTargets.length === 1 ? projectTargets[0] : undefined;

	const {
		data: contributors,
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"pullRequests",
			"repoContributors",
			singleTarget?.projectId,
			singleTarget?.hostUrl,
		],
		queryFn: async () => {
			if (!singleTarget?.hostUrl) return [];
			const client = getHostServiceClientByUrl(singleTarget.hostUrl);
			return client.workspaceCreation.getRepoContributors.query({
				projectId: singleTarget.projectId,
			});
		},
		enabled: !!singleTarget?.hostUrl,
		staleTime: 5 * 60_000,
		gcTime: 10 * 60_000,
	});

	const filtered = useMemo(() => {
		const q = search.trim().replace(/^@/, "").toLowerCase();
		const list = [...(contributors ?? [])];
		for (const login of selected) {
			if (
				!list.some(
					(contributor) =>
						contributor.login.toLowerCase() === login.toLowerCase(),
				)
			) {
				list.push({ login });
			}
		}
		if (!q) return list;
		return list.filter((c) => c.login.toLowerCase().includes(q));
	}, [contributors, search, selected]);

	const normalizedSearch = normalizeGithubLogin(search)?.toLowerCase() ?? null;
	const showCustomOption =
		!!normalizedSearch &&
		!filtered.some((c) => c.login.toLowerCase() === normalizedSearch);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearch("");
	};

	const handleSelect = (login: string | null) => {
		const next =
			login === null
				? []
				: isSelected(login)
					? selected.filter(
							(entry) => entry.toLowerCase() !== login.toLowerCase(),
						)
					: [...selected, login];
		onChange(normalizeGithubLogins(next.join(",")));
		setSearch("");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={label}
					aria-label={copy.triggerLabel(label)}
					className="h-8 max-w-44 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<Icon className="size-4 shrink-0" />
					<span className="truncate text-sm">{label}</span>
					<HiChevronDown className="size-3 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={
							singleTarget
								? copy.scopedPlaceholder
								: t({
										message: "GitHub username…",
									})
						}
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-72">
						{singleTarget && isLoading && !contributors && (
							<div className="px-3 py-4 text-center text-sm text-muted-foreground">
								<Trans>Loading contributors…</Trans>
							</div>
						)}
						{(!search || filtered.length > 0 || showCustomOption) && (
							<CommandGroup>
								{!search && (
									<CommandItem
										aria-checked={!value}
										onSelect={() => handleSelect(null)}
									>
										<Icon className="size-4 shrink-0" />
										<span className="text-sm">{copy.emptyLabel}</span>
										{!value && (
											<HiCheck className="ml-auto size-3.5 shrink-0" />
										)}
									</CommandItem>
								)}
								{filtered.map((contributor) => (
									<CommandItem
										key={contributor.login}
										aria-label={contributor.login}
										aria-checked={isSelected(contributor.login)}
										disabled={
											!isSelected(contributor.login) &&
											selected.length >= MAX_SELECTED
										}
										onSelect={() => handleSelect(contributor.login)}
									>
										<Avatar className="size-4 shrink-0 rounded-sm">
											<AvatarImage
												src={`https://github.com/${contributor.login}.png?size=32`}
												alt={contributor.login}
											/>
											<AvatarFallback className="rounded-sm text-[8px]">
												{contributor.login.slice(0, 1).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span className="truncate text-sm">
											{contributor.login}
										</span>
										{isSelected(contributor.login) && (
											<HiCheck className="ml-auto size-3.5 shrink-0" />
										)}
									</CommandItem>
								))}
								{showCustomOption && normalizedSearch && (
									<CommandItem
										disabled={selected.length >= MAX_SELECTED}
										onSelect={() => handleSelect(normalizedSearch)}
									>
										<Icon className="size-4 shrink-0" />
										<span className="text-sm">
											<Trans>Filter by @{normalizedSearch}</Trans>
										</span>
									</CommandItem>
								)}
							</CommandGroup>
						)}
						{singleTarget && !isLoading && error && (
							<div className="px-3 py-4 text-center text-sm text-muted-foreground">
								<Trans>
									Couldn't load contributors. Type a username instead.
								</Trans>
							</div>
						)}
						{!isLoading &&
							!error &&
							filtered.length === 0 &&
							!showCustomOption &&
							// A search that matches nobody and is not a valid login to
							// filter by still needs to say so, even in a repo that has
							// contributors — otherwise the list just goes blank.
							(!!search ||
								!singleTarget ||
								(contributors && contributors.length === 0)) && (
								<CommandEmpty>
									{search ? (
										copy.noneFound
									) : (
										<Trans>No contributors found.</Trans>
									)}
								</CommandEmpty>
							)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
