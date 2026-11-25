import type { CloudWorkspaceStatus } from "@superset/db/schema";
import semver from "semver";
import type { ApiClientInfo } from "../../trpc";

export const SLEEP_STATUS_CLIENT_FLOORS: Record<
	ApiClientInfo["product"],
	string
> = {
	desktop: "2.0.10",
	cli: "2.0.10",
	mobile: "1.2.3",
	sdk: "0.0.1-alpha.13",
};

function readsOnlyLegacyStatus(client: ApiClientInfo): boolean {
	const version = semver.valid(client.version);
	return (
		version !== null &&
		semver.lt(version, SLEEP_STATUS_CLIENT_FLOORS[client.product])
	);
}

/** A cloud workspace's status as `client` reads it; null is web or a pre-header build. */
export function cloudWorkspaceStatusFor(
	client: ApiClientInfo | null,
	status: CloudWorkspaceStatus,
): CloudWorkspaceStatus {
	if (!client || !readsOnlyLegacyStatus(client)) return status;
	if (status === "awake" || status === "asleep") return "ready";
	if (status === "archived") return "deleted";
	return status;
}

export function withClientStatus<Row extends { status: CloudWorkspaceStatus }>(
	client: ApiClientInfo | null,
	row: Row,
): Row {
	return { ...row, status: cloudWorkspaceStatusFor(client, row.status) };
}
