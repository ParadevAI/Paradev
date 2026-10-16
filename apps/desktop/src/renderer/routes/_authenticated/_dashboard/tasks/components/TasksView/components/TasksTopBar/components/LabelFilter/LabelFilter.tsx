import { Trans, useLingui } from "@lingui/react/macro";
import {
	labelDepth,
	labelLeafName,
	sortLabelsAsTree,
} from "@superset/shared/labels";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useMemo, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineTag } from "react-icons/hi2";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CloudWorkspaceLabelDot } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceLabelDot";

interface LabelFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

export function LabelFilter({ value, onChange }: LabelFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const organizationId = useActiveOrganizationId();
	const { data: labels } = cloudTrpc.taskLabel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: Boolean(organizationId) },
	);

	const tree = useMemo(() => sortLabelsAsTree(labels ?? []), [labels]);
	const query = search.trim().toLowerCase();
	const visible = query
		? tree.filter((label) => label.name.toLowerCase().includes(query))
		: tree;

	const handleSelect = (name: string | null) => {
		onChange(name);
		setOpen(false);
		setSearch("");
	};

	const title = value ?? t({ message: "Label", context: "task label filter" });

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={title}
					aria-label={title}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<HiOutlineTag className="size-4" />
					<span className="text-sm hidden @4xl:inline max-w-40 truncate">
						{value ?? <Trans context="task label filter">Label</Trans>}
					</span>
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({ message: "Search labels..." })}
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-80">
						<CommandGroup>
							<CommandItem onSelect={() => handleSelect(null)}>
								<span className="text-sm">
									<Trans>All labels</Trans>
								</span>
								{value === null && <HiCheck className="ml-auto size-3.5" />}
							</CommandItem>
						</CommandGroup>
						{visible.length === 0 ? (
							<CommandEmpty>
								<Trans>No labels found.</Trans>
							</CommandEmpty>
						) : (
							<>
								<CommandSeparator />
								<CommandGroup>
									{visible.map((label) => (
										<CommandItem
											key={label.id}
											value={label.name}
											onSelect={() => handleSelect(label.name)}
										>
											<span
												className="flex min-w-0 items-center gap-2"
												style={
													query
														? undefined
														: { paddingLeft: labelDepth(label.name) * 14 }
												}
											>
												<CloudWorkspaceLabelDot color={label.color} />
												<span className="truncate text-sm">
													{query ? label.name : labelLeafName(label.name)}
												</span>
											</span>
											{label.name === value && (
												<HiCheck className="ml-auto size-3.5 shrink-0" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
