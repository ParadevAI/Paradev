interface ActivityEntry {
	at: Date | string;
	actor: { kind: "user"; person: { name: string } } | { kind: "system" };
	event: string | null;
	fromName: string | null;
	toName: string | null;
	fromVisibility: string | null;
	toVisibility: string | null;
	fromProject: { name: string } | null;
	toProject: { name: string } | null;
	addedLabels: { name: string }[];
	removedLabels: { name: string }[];
	linkedTask: { slug: string } | null;
	unlinkedTask: { slug: string } | null;
	prUrl: string | null;
	shareTarget:
		| { kind: "user"; person: { name: string } }
		| { kind: "team"; name: string }
		| { kind: "email"; email: string }
		| null;
}

/** One line per timeline entry; the JSON output keeps every field. */
export function describeActivity(entry: ActivityEntry): string {
	if (entry.toName)
		return `renamed "${entry.fromName ?? ""}" → "${entry.toName}"`;
	if (entry.toVisibility) {
		return `visibility ${entry.fromVisibility ?? "—"} → ${entry.toVisibility}`;
	}
	if (entry.fromProject || entry.toProject) {
		return `project ${entry.fromProject?.name ?? "—"} → ${entry.toProject?.name ?? "—"}`;
	}
	if (entry.addedLabels.length) {
		return `added label ${entry.addedLabels.map((label) => label.name).join(", ")}`;
	}
	if (entry.removedLabels.length) {
		return `removed label ${entry.removedLabels.map((label) => label.name).join(", ")}`;
	}
	if (entry.linkedTask) return `linked task ${entry.linkedTask.slug}`;
	if (entry.unlinkedTask) return `unlinked task ${entry.unlinkedTask.slug}`;
	if (entry.prUrl) return `pull request ${entry.prUrl}`;
	if (entry.shareTarget) {
		const who =
			entry.shareTarget.kind === "user"
				? entry.shareTarget.person.name
				: entry.shareTarget.kind === "team"
					? `team ${entry.shareTarget.name}`
					: entry.shareTarget.email;
		return `${(entry.event ?? "shared").replaceAll("_", " ")} with ${who}`;
	}
	return (entry.event ?? "updated").replaceAll("_", " ");
}
