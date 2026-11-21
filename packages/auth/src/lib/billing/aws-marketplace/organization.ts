import { db } from "@superset/db/client";
import { awsMarketplaceCustomers } from "@superset/db/schema";
import { and, eq, ne } from "drizzle-orm";

/** True while AWS Marketplace bills the organization, so Stripe and Autumn checkout must not. */
export async function isAwsMarketplaceOrganization(
	organizationId: string,
): Promise<boolean> {
	const row = await db.query.awsMarketplaceCustomers.findFirst({
		where: and(
			eq(awsMarketplaceCustomers.organizationId, organizationId),
			ne(awsMarketplaceCustomers.status, "inactive"),
		),
		columns: { id: true },
	});
	return !!row;
}
