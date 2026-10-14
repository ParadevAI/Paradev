"use client";

import { useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { PillTabs } from "@/app/[lang]/components/PillTabs";
import type { OrgList } from "@/app/[lang]/utils/fetchLeaderboard";

export type Scope = "all" | "org";

const SEARCH_THRESHOLD = 8;

interface ScopeTabsProps {
	scope: Scope;
	orgList: OrgList;
	organizationId: string | null;
	onChange: (scope: Scope, organizationId?: string) => void;
}

export function ScopeTabs({
	scope,
	orgList,
	organizationId,
	onChange,
}: ScopeTabsProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { organizations, minMembers } = orgList;
	const selected =
		organizations.find((org) => org.id === organizationId) ?? organizations[0];
	const active = scope === "org";
	const pillClassName = `inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm border rounded-[2px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
		active
			? "border-brand text-brand bg-brand/5"
			: "border-border text-muted-foreground hover:text-foreground"
	}`;

	if (!selected) return null;

	return (
		<PillTabs
			label={t({ message: "Show" })}
			value={active ? null : "all"}
			options={[{ id: "all", label: t({ message: "All" }) }]}
			onChange={() => onChange("all")}
		>
			{organizations.length === 1 ? (
				<button
					type="button"
					role="tab"
					aria-selected={active}
					onClick={() => onChange("org", selected.id)}
					className={pillClassName}
				>
					{selected.name}
				</button>
			) : (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							role="tab"
							aria-selected={active}
							className={pillClassName}
						>
							<span className="max-w-48 truncate">{selected.name}</span>
							<ChevronDown className="size-3.5 shrink-0" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 p-0">
						<Command>
							{organizations.length > SEARCH_THRESHOLD && (
								<CommandInput
									placeholder={t({ message: "Search organizations" })}
								/>
							)}
							<CommandList>
								<CommandEmpty>
									{t({ message: "No organization by that name." })}
								</CommandEmpty>
								{organizations.map((org) => {
									const members = org.members;
									const belowFloor = members < minMembers;
									return (
										<CommandItem
											key={org.id}
											value={`${org.name} ${org.id}`}
											onSelect={() => {
												onChange("org", org.id);
												setOpen(false);
											}}
											className="justify-between gap-3"
										>
											<span
												className={`truncate ${belowFloor ? "text-muted-foreground" : ""}`}
											>
												{org.name}
											</span>
											{belowFloor && (
												<span className="shrink-0 font-mono text-xs text-muted-foreground">
													{t`${members} of ${minMembers}`}
												</span>
											)}
										</CommandItem>
									);
								})}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			)}
		</PillTabs>
	);
}
