/** Who is calling: a person, or a Dev working for a person. */
export type Principal = PersonPrincipal | DevPrincipal;

export interface PersonPrincipal {
	kind: "person";
	userId: string;
	organizationId: string | null;
}

export interface DevPrincipal {
	kind: "dev";
	agentId: string;
	organizationId: string;
	/** Who the Dev belongs to; null once that person's account is gone. */
	ownerId: string | null;
	/** The person this chain of work is for. Always set: no person, no work. */
	askerId: string;
	sessionId: string;
	turnId: string;
}

/** Who did it. People and Devs share the actors id space. */
export const actorOf = (principal: Principal) =>
	principal.kind === "person" ? principal.userId : principal.agentId;

/** Who it was for. */
export const onBehalfOf = (principal: Principal) =>
	principal.kind === "person" ? principal.userId : principal.askerId;
