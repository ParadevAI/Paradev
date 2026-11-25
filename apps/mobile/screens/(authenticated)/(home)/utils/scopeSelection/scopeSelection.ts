export interface ScopeSelection {
	hosts: string[];
	cloud: boolean;
}

export type WorkspaceScope = "host" | "cloud" | "multi";

/** More machines than this and Home never queries them all at once. */
export const MAX_SELECTED_HOSTS = 3;

export interface SelectableHost {
	machineId: string;
	name: string;
	isOnline: boolean;
}

const byName = (a: SelectableHost, b: SelectableHost) =>
	a.name.localeCompare(b.name);

/** The All hosts shortcut: for an org small enough to tick every machine. */
export function isAllHostsOffered(
	hostCount: number,
	cloudEnabled: boolean,
): boolean {
	return (
		hostCount <= MAX_SELECTED_HOSTS && hostCount + (cloudEnabled ? 1 : 0) >= 2
	);
}

export function everythingSelection(
	hosts: readonly SelectableHost[],
	cloudEnabled: boolean,
): ScopeSelection {
	return {
		hosts: [...hosts].sort(byName).map((host) => host.machineId),
		cloud: cloudEnabled,
	};
}

/**
 * Everything for an org with few machines; otherwise one machine, online
 * first. An org with no machine lands on Cloud once the roster has answered.
 */
export function defaultSelection(
	hosts: readonly SelectableHost[],
	cloudEnabled: boolean,
	hostsAnswered: boolean,
): ScopeSelection {
	if (hosts.length === 0) {
		return { hosts: [], cloud: cloudEnabled && hostsAnswered };
	}
	if (hosts.length <= MAX_SELECTED_HOSTS) {
		return everythingSelection(hosts, cloudEnabled);
	}
	const sorted = [...hosts].sort(byName);
	const first = sorted.find((host) => host.isOnline) ?? sorted[0];
	return { hosts: first ? [first.machineId] : [], cloud: false };
}

/**
 * The saved selection, minus machines that no longer exist and Cloud where
 * it is off. Nothing valid left means the default. A roster still pending is
 * not an answer, so the saved pick stands until it arrives.
 */
export function resolveSelection({
	saved,
	hosts,
	cloudEnabled,
	hostsAnswered,
}: {
	saved: ScopeSelection | null;
	hosts: readonly SelectableHost[];
	cloudEnabled: boolean;
	hostsAnswered: boolean;
}): ScopeSelection {
	if (saved && !hostsAnswered) {
		return {
			hosts: saved.hosts.slice(0, MAX_SELECTED_HOSTS),
			cloud: saved.cloud && cloudEnabled,
		};
	}
	if (saved) {
		const known = new Set(hosts.map((host) => host.machineId));
		const valid = {
			hosts: saved.hosts
				.filter((machineId) => known.has(machineId))
				.slice(0, MAX_SELECTED_HOSTS),
			cloud: saved.cloud && cloudEnabled,
		};
		if (valid.hosts.length > 0 || valid.cloud) return valid;
	}
	return defaultSelection(hosts, cloudEnabled, hostsAnswered);
}

const placeCount = (selection: ScopeSelection) =>
	selection.hosts.length + (selection.cloud ? 1 : 0);

export function canTickHost(
	selection: ScopeSelection,
	machineId: string,
): boolean {
	return (
		selection.hosts.includes(machineId) ||
		selection.hosts.length < MAX_SELECTED_HOSTS
	);
}

/** Ticks or unticks a machine; never past the cap, never to nothing. */
export function toggleHost(
	selection: ScopeSelection,
	machineId: string,
): ScopeSelection {
	if (selection.hosts.includes(machineId)) {
		if (placeCount(selection) === 1) return selection;
		return {
			...selection,
			hosts: selection.hosts.filter((id) => id !== machineId),
		};
	}
	if (!canTickHost(selection, machineId)) return selection;
	return { ...selection, hosts: [...selection.hosts, machineId] };
}

/** Ticks or unticks Cloud; never to nothing. */
export function toggleCloud(selection: ScopeSelection): ScopeSelection {
	if (selection.cloud && placeCount(selection) === 1) return selection;
	return { ...selection, cloud: !selection.cloud };
}

export function isEverything(
	selection: ScopeSelection,
	hosts: readonly SelectableHost[],
	cloudEnabled: boolean,
): boolean {
	const ticked = new Set(selection.hosts);
	return (
		hosts.every((host) => ticked.has(host.machineId)) &&
		(selection.cloud || !cloudEnabled)
	);
}

export function selectionScope(selection: ScopeSelection): WorkspaceScope {
	if (placeCount(selection) > 1) return "multi";
	return selection.cloud ? "cloud" : "host";
}

export type SelectionLabel =
	| { kind: "host"; machineId: string }
	| { kind: "cloud" }
	| { kind: "all" }
	| { kind: "count"; count: number };

/** One place by its name; everything as All hosts; otherwise how many. */
export function selectionLabel(
	selection: ScopeSelection,
	hosts: readonly SelectableHost[],
	cloudEnabled: boolean,
): SelectionLabel {
	const scope = selectionScope(selection);
	if (scope === "cloud") return { kind: "cloud" };
	if (scope === "host") {
		return { kind: "host", machineId: selection.hosts[0] ?? "" };
	}
	if (isEverything(selection, hosts, cloudEnabled)) return { kind: "all" };
	return { kind: "count", count: placeCount(selection) };
}

export function selectedHosts<H extends SelectableHost>(
	hosts: readonly H[],
	selection: ScopeSelection,
): H[] {
	const ticked = new Set(selection.hosts);
	return hosts.filter((host) => ticked.has(host.machineId)).sort(byName);
}
