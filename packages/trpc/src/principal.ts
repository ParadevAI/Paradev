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
	/** The owner asked for everything in this turn, so the owner's access applies. */
	ownerAsks: boolean;
	sessionId: string;
	turnId: string;
}

export const actorOf = (principal: Principal) =>
	principal.kind === "person" ? principal.userId : principal.agentId;

export const onBehalfOf = (principal: Principal) =>
	principal.kind === "person" ? principal.userId : principal.askerId;
