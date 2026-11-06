import type { Connector } from "@superset/shared/connectors";

// Inbound events (webhooks, bot events, mail push) find their organization by
// external account id. Add a connector here before it calls accountConnection(s).
export const ACCOUNT_ROUTED_CONNECTORS: ReadonlySet<string> = new Set([
	"google",
	"linear",
	"notion",
	"slack",
]);

export function isOneOrganizationPerAccount(
	slug: string,
	connector: Pick<Connector, "scope">,
): boolean {
	return connector.scope === "org" || ACCOUNT_ROUTED_CONNECTORS.has(slug);
}
