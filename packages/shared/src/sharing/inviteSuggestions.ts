import type {
	InviteNewMode,
	ShareDirectory,
	ShareGrantee,
	SharePerson,
	ShareTeam,
	StagedPick,
} from "./types";

export type SuggestionItem =
	| { kind: "section"; section: "invite" | "people" | "teams" }
	| { kind: "heading" }
	| {
			kind: "invite";
			email: string;
			completion: boolean;
			invited: boolean;
			selected: boolean;
	  }
	| { kind: "invalid"; text: string }
	| { kind: "blocked" }
	| {
			kind: "member";
			person: SharePerson;
			hasAccess: boolean;
			selected: boolean;
	  }
	| { kind: "team"; team: ShareTeam; hasAccess: boolean; selected: boolean }
	| { kind: "empty" };

export const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function isEmail(value: string): boolean {
	return EMAIL_PATTERN.test(value);
}

export function stagedKey(pick: StagedPick): string {
	switch (pick.kind) {
		case "user":
			return `user:${pick.person.userId}`;
		case "team":
			return `team:${pick.team.teamId}`;
		case "email":
			return `email:${pick.email}`;
	}
}

/**
 * The invite list for `query`: a way to invite someone new when an address is
 * being typed, then people, then teams. Picks stay listed, marked selected,
 * and people who already have access sink below the rest.
 */
export function inviteSuggestions({
	query,
	directory,
	grantees,
	staged,
	ownerId,
	inviteNew,
}: {
	query: string;
	directory: ShareDirectory;
	grantees: ShareGrantee[];
	staged: StagedPick[];
	ownerId: string | null;
	inviteNew: InviteNewMode;
}): SuggestionItem[] {
	const q = query.trim().toLowerCase();

	const stagedKeys = new Set(staged.map(stagedKey));
	const sharedUsers = new Set(
		grantees.flatMap((g) => (g.kind === "user" ? [g.userId] : [])),
	);
	const sharedTeams = new Set(
		grantees.flatMap((g) => (g.kind === "team" ? [g.teamId] : [])),
	);
	const invitedEmails = new Set(
		grantees.flatMap((g) =>
			g.kind === "invitation" ? [g.email.toLowerCase()] : [],
		),
	);
	const memberEmails = new Set(
		directory.members.map((m) => m.email.toLowerCase()),
	);

	const people = directory.members
		.filter(
			(person) =>
				person.name.toLowerCase().includes(q) ||
				person.email.toLowerCase().startsWith(q),
		)
		.map(
			(person): SuggestionItem => ({
				kind: "member",
				person,
				hasAccess: person.userId === ownerId || sharedUsers.has(person.userId),
				selected: stagedKeys.has(`user:${person.userId}`),
			}),
		);
	const teams = directory.teams
		.filter((team) => team.name.toLowerCase().includes(q))
		.map(
			(team): SuggestionItem => ({
				kind: "team",
				team,
				hasAccess: sharedTeams.has(team.teamId),
				selected: stagedKeys.has(`team:${team.teamId}`),
			}),
		);

	const invite = (email: string, completion: boolean): SuggestionItem => ({
		kind: "invite",
		email,
		completion,
		invited: invitedEmails.has(email),
		selected: stagedKeys.has(`email:${email}`),
	});
	const stagedEmails = staged.flatMap((p) =>
		p.kind === "email" ? [p.email] : [],
	);
	const invites: SuggestionItem[] = [];
	if (!q) {
		invites.push(...stagedEmails.map((email) => invite(email, false)));
	} else if (isEmail(q)) {
		if (!memberEmails.has(q)) invites.push(invite(q, false));
	} else if (!/[\s,;]/.test(q) && (q.includes("@") || !people.length)) {
		const [local, domain] = q.split("@");
		const completions = local
			? directory.domains
					.filter((d) => domain === undefined || d.startsWith(domain))
					.map((d) => `${local}@${d}`)
					.filter((email) => !memberEmails.has(email))
			: [];
		if (completions.length) {
			invites.push(
				{ kind: "heading" },
				...completions.map((email) => invite(email, true)),
			);
		} else if (q.includes("@")) {
			invites.push({ kind: "invalid", text: q });
		}
	}

	const items: SuggestionItem[] = [];
	if (invites.length) {
		if (inviteNew === "admins-only" && q) items.push({ kind: "blocked" });
		else if (invites[0]?.kind === "heading") items.push(...invites);
		else items.push({ kind: "section", section: "invite" }, ...invites);
	}
	const withAccessLast = (rows: SuggestionItem[]) => [
		...rows.filter((r) => !("hasAccess" in r) || !r.hasAccess),
		...rows.filter((r) => "hasAccess" in r && r.hasAccess),
	];
	if (people.length) {
		items.push(
			{ kind: "section", section: "people" },
			...withAccessLast(people),
		);
	}
	if (teams.length) {
		items.push({ kind: "section", section: "teams" }, ...withAccessLast(teams));
	}
	if (!items.length && q) items.push({ kind: "empty" });
	return items;
}

/** Indexes of the items a person can pick with the keyboard. */
export function pickableIndexes(items: SuggestionItem[]): number[] {
	return items.flatMap((item, index) => {
		switch (item.kind) {
			case "team":
			case "member":
				return item.hasAccess ? [] : [index];
			case "invite":
				return item.invited ? [] : [index];
			case "invalid":
				return [index];
			default:
				return [];
		}
	});
}

/** The pick a suggestion stands for, or null for one that can't be picked. */
export function pickOf(item: SuggestionItem): StagedPick | null {
	switch (item.kind) {
		case "member":
			return { kind: "user", person: item.person };
		case "team":
			return { kind: "team", team: item.team };
		case "invite":
			return { kind: "email", email: item.email };
		default:
			return null;
	}
}
