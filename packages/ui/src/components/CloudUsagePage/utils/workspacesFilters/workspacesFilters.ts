import { MACHINE_SIZES } from "@superset/shared/billing";
import type {
	WorkspaceRef,
	WorkspacesFilters,
	WorkspacesRows,
	WorkspacesSort,
} from "../../types";

/** The statuses a person can filter by, in the design's order. */
export const FILTER_STATUSES = [
	"provisioning",
	"awake",
	"asleep",
	"failed",
	"archived",
] as const satisfies readonly WorkspaceRef["status"][];

const SORTS = [
	"gbHours",
	"hours",
	"name",
	"status",
] as const satisfies readonly WorkspacesSort[];
/** The first is the default, as in the design. */
export const ROWS_PER_PAGE = [
	15, 50,
] as const satisfies readonly WorkspacesRows[];
const MAX_PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(values: readonly T[], value: unknown) =>
	values.find((item) => item === value);

const pageOf = (value: unknown) => {
	const page = Number(value);
	return Number.isInteger(page) && page > 1 && page <= MAX_PAGE
		? page
		: undefined;
};

/** The filters in a URL's search params; a value the router would refuse is dropped. */
export function workspacesFilters(
	read: (key: string) => unknown,
): WorkspacesFilters {
	const user = read("user");
	const q = read("q");
	return {
		user: typeof user === "string" && UUID.test(user) ? user : undefined,
		size: oneOf(MACHINE_SIZES, read("size")),
		status: oneOf(FILTER_STATUSES, read("status")),
		q: typeof q === "string" && q.trim() ? q.trim().slice(0, 200) : undefined,
		sort: oneOf(SORTS, read("sort")),
		rows: ROWS_PER_PAGE.find((rows) => String(rows) === String(read("rows"))),
		page: pageOf(read("page")),
	};
}
