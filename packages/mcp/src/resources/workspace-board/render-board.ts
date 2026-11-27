/**
 * Serialized with `toString()` into the board's HTML, so it must stay
 * self-contained: no imports and no references to other module-level names.
 */
export function renderBoard(structuredContent: unknown): string {
	type Row = Record<string, unknown>;
	const escapeHtml = (value: unknown) =>
		String(value).replace(
			/[&<>"']/g,
			(char) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[char] as string,
		);
	const text = (value: unknown) =>
		typeof value === "string" && value.length > 0 ? value : null;
	const statusOf = (row: Row) => {
		if (text(row.status)) return text(row.status) as string;
		if (row.archivedAt) return "archived";
		if (row.worktreeExists === false) return "missing";
		return null;
	};
	const toneOf = (status: string) => {
		if (status === "awake") return "success";
		if (status === "provisioning") return "info";
		if (status === "failed" || status === "missing") return "danger";
		return "neutral";
	};

	const content =
		structuredContent && typeof structuredContent === "object"
			? (structuredContent as Row)
			: {};
	const rows = (Array.isArray(content.result) ? content.result : []).filter(
		(row): row is Row => !!row && typeof row === "object",
	);
	if (rows.length === 0) {
		return '<p class="empty">No workspaces</p>';
	}

	const groups = new Map<
		string,
		{ project: string; host: string; rows: Row[] }
	>();
	for (const row of rows) {
		const host = text(row.hostId) ?? "Cloud";
		const project = text(row.projectName) ?? "Workspaces";
		const key = `${host}\u0000${project}`;
		const group = groups.get(key) ?? { project, host, rows: [] };
		group.rows.push(row);
		groups.set(key, group);
	}

	return [...groups.values()]
		.map((group) => {
			const items = group.rows
				.map((row) => {
					const name =
						text(row.name) ?? text(row.branch) ?? text(row.id) ?? "Workspace";
					const branch = text(row.branch);
					const status = statusOf(row);
					return [
						'<li class="row">',
						`<span class="name">${escapeHtml(name)}</span>`,
						branch && branch !== name
							? `<span class="branch">${escapeHtml(branch)}</span>`
							: "",
						status
							? `<span class="status" data-tone="${toneOf(status)}">${escapeHtml(status)}</span>`
							: "",
						"</li>",
					].join("");
				})
				.join("");
			return [
				'<details class="group" open>',
				"<summary>",
				`<span class="project">${escapeHtml(group.project)}</span>`,
				`<span class="host">${escapeHtml(group.host)}</span>`,
				`<span class="count">${group.rows.length}</span>`,
				"</summary>",
				`<ul>${items}</ul>`,
				"</details>",
			].join("");
		})
		.join("");
}
