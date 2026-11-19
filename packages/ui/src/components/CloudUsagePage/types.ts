import type {
	ALLOWANCE_UNAVAILABLE_FIELDS,
	ALLOWANCE_UNAVAILABLE_REASONS,
	MachineSize,
} from "@superset/shared/billing";
import type { ComponentType, ReactNode } from "react";

/** The cloud router's outputs as this page reads them. Each app passes its router's output, so a router change that breaks them fails that app's typecheck. */
interface Window {
	from: Date;
	to: Date;
}

export interface CloudMetrics {
	workspaces: number;
	boots: number;
	failedBoots: number;
	hours: number;
	gbHours: number;
	usageUsd: number | null;
}

export type PersonRef = { id: string; name: string; email: string };

export interface WorkspaceRef {
	id: string;
	name: string;
	status:
		| "provisioning"
		| "ready"
		| "failed"
		| "deleted"
		| "awake"
		| "asleep"
		| "archived";
	size: MachineSize;
	owner: PersonRef | null;
	failure: { reason: FailureReason; at: Date } | null;
	lastBoot: { endReason: BootEndReason | null; stoppedAt: Date | null } | null;
}

type FailureReason =
	| "usage_limit"
	| "needs_paid_plan"
	| "host_not_ready"
	| "create_failed"
	| "queue_failed"
	| "sandbox_gone"
	| "snapshot_expired";

type BootEndReason =
	| "idle"
	| "user"
	| "usage_limit"
	| "archived"
	| "restarted"
	| "failed"
	| "released"
	| "crashed"
	| "unknown";

export interface CloudUsageRow extends CloudMetrics {
	key: string | null;
	label: string | null;
	ref: WorkspaceRef | PersonRef | null;
}

export interface CloudUsage {
	range: Window;
	items: CloudUsageRow[];
	total: CloudMetrics;
	rowCount: number;
	nextCursor: string | null;
}

export interface CloudBoot {
	id: string;
	sessionId: string | null;
	workspace: { id: string; name: string } | null;
	user: PersonRef | null;
	startedAt: Date;
	stoppedAt: Date | null;
	minutes: number;
	size: MachineSize | null;
	memoryGb: number;
	vcpus: number;
	endReason: BootEndReason | null;
	gbHours: number;
	usageUsd: number | null;
}

export interface CloudBoots {
	range: Window;
	items: CloudBoot[];
	nextCursor: string | null;
}

interface CreditLine {
	usedGbHours: number;
	totalGbHours: number;
	usedUsd: number | null;
	totalUsd: number | null;
}

export interface CloudPeriod {
	id: string;
	start: Date;
	end: Date;
	closed: boolean;
	allowance: {
		includedGbHours: number | null;
		usedGbHours: number;
		overageGbHours: number;
		prepaidRemainingGbHours: number;
		resetsAt: Date;
		usedUsd: number | null;
		includedUsd: number | null;
		overageUsd: number | null;
		seats: number | null;
		bought: CreditLine | null;
		freeCredits: CreditLine | null;
		extraUsageLimit: { gbHours: number; usd: number | null } | null;
		limitReached: boolean | null;
	} | null;
	unavailable: {
		field: "allowance" | (typeof ALLOWANCE_UNAVAILABLE_FIELDS)[number];
		reason:
			| "closed_period"
			| "owners_and_admins_only"
			| (typeof ALLOWANCE_UNAVAILABLE_REASONS)[number];
	}[];
	metrics: CloudMetrics;
}

export interface CloudPeriods {
	items: CloudPeriod[];
	nextCursor: string | null;
}

/** The part of a React Query result this page reads, so each app passes its own tRPC binding's result. */
export interface CloudQuery<TData> {
	data: TData | undefined;
	isError: boolean;
	refetch: () => unknown;
}

export interface CloudPages<TPage> extends CloudQuery<{ pages: TPage[] }> {
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => Promise<unknown>;
}

export type WorkspacesSort = "gbHours" | "hours" | "name" | "status";
export type WorkspacesRows = 15 | 50;

/** The Workspaces page's filters and sort, kept in the URL. Absent means any, and GB-hours for the sort. */
export interface WorkspacesFilters {
	user?: string;
	size?: WorkspaceRef["size"];
	status?: WorkspaceRef["status"];
	q?: string;
	sort?: WorkspacesSort;
	rows?: WorkspacesRows;
	/** 1-based; absent for the first page. */
	page?: number;
}

/** A place in the cloud usage pages; each app maps it to its own router. `period` is a period id, absent for the newest. */
export type CloudUsageTarget =
	| { view: "overview"; period?: string }
	| ({ view: "workspaces"; period?: string } & WorkspacesFilters)
	| { view: "workspace"; workspaceId: string; period?: string }
	| { view: "billing" };

export type WorkspacesTarget = Extract<
	CloudUsageTarget,
	{ view: "workspaces" }
>;

export type CloudUsageLink = ComponentType<{
	to: CloudUsageTarget;
	className?: string;
	"aria-label"?: string;
	children: ReactNode;
}>;
