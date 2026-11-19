"use client";

import { useLingui } from "@lingui/react/macro";
import { MACHINE_SIZES } from "@superset/shared/billing";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import { useEffect, useState } from "react";
import { LuSearch, LuX } from "react-icons/lu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "../../../../../ui/input-group";
import { STATUS_BADGES } from "../../../../constants";
import type { PersonRef, WorkspacesFilters } from "../../../../types";
import { FILTER_STATUSES } from "../../../../utils/workspacesFilters";
import { FilterSelect } from "../FilterSelect";

const SEARCH_DELAY_MS = 300;

interface WorkspacesToolbarProps {
	filters: WorkspacesFilters;
	/** Null for a member, who has only the search box, as in the design. */
	people: PersonRef[] | null;
	onChange: (filters: WorkspacesFilters) => void;
}

export function WorkspacesToolbar({
	filters,
	people,
	onChange,
}: WorkspacesToolbarProps) {
	const { i18n, t } = useLingui();
	const [text, setText] = useState(filters.q ?? "");

	useEffect(() => setText(filters.q ?? ""), [filters.q]);
	useEffect(() => {
		const q = text.trim() || undefined;
		if (q === filters.q) return;
		const timer = setTimeout(
			() => onChange({ ...filters, q }),
			SEARCH_DELAY_MS,
		);
		return () => clearTimeout(timer);
	}, [text, filters, onChange]);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<InputGroup className="h-8 w-full @xl:w-auto @xl:min-w-48 @xl:flex-1">
				<InputGroupAddon>
					<LuSearch />
				</InputGroupAddon>
				<InputGroupInput
					value={text}
					onChange={(event) => setText(event.target.value)}
					placeholder={t({ message: "Search" })}
					aria-label={t({ message: "Search workspaces" })}
				/>
				{text && (
					<InputGroupAddon align="inline-end">
						<InputGroupButton
							size="icon-xs"
							onClick={() => setText("")}
							aria-label={t({ message: "Clear search" })}
						>
							<LuX />
						</InputGroupButton>
					</InputGroupAddon>
				)}
			</InputGroup>
			{people && (
				<>
					<FilterSelect
						any={t({ message: "Any person" })}
						value={filters.user}
						options={people.map((person) => ({
							value: person.id,
							label: person.name,
						}))}
						onChange={(user) => onChange({ ...filters, user })}
					/>
					<FilterSelect
						any={t({ message: "Any size" })}
						value={filters.size}
						options={MACHINE_SIZES.map((size) => ({
							value: size,
							label: i18n._(MACHINE_SIZE_NAMES[size]),
						}))}
						onChange={(size) => onChange({ ...filters, size })}
					/>
					<FilterSelect
						any={t({ message: "Any status" })}
						value={filters.status}
						options={FILTER_STATUSES.map((status) => ({
							value: status,
							label: i18n._(STATUS_BADGES[status].label),
						}))}
						onChange={(status) => onChange({ ...filters, status })}
					/>
				</>
			)}
		</div>
	);
}
