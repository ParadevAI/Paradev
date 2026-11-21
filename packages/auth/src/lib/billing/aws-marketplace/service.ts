import { createHash, randomBytes } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import {
	awsMarketplaceCustomers,
	members,
	organizations,
	type SelectAwsMarketplaceCustomer,
} from "@superset/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { autumnClient } from "../../../autumn";
import { ensureAutumnCustomer, heldAutumnPlanId } from "../autumn/customer";
import { invalidateOrganizationBilling } from "../autumn/plan-state";
import { seatPurchase } from "../autumn/seats";
import {
	type AwsMarketplaceApi,
	awsMarketplaceApi,
	awsMarketplaceConfig,
	fetchEntitlements,
} from "./api";
import { dimensionPlanIds, planFromEntitlements } from "./entitlements";
import type { LicenseLocator } from "./events";
import {
	type AutumnPlanWriter,
	applyPlanChange,
	planChange,
} from "./provision";
import { resolveRegistration } from "./registration";

const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const LINK_ROLES = ["owner", "admin"];

export class AwsMarketplaceDisabledError extends Error {
	constructor() {
		super("AWS Marketplace is not configured");
		this.name = "AwsMarketplaceDisabledError";
	}
}

function requireConfig() {
	const config = awsMarketplaceConfig();
	if (!config) throw new AwsMarketplaceDisabledError();
	return config;
}

function hashClaim(claimToken: string): string {
	return createHash("sha256").update(claimToken).digest("hex");
}

const autumnWriter: AutumnPlanWriter = {
	ensureCustomer: ensureAutumnCustomer,
	seatQuantities: async (planId, seats) =>
		(await seatPurchase(planId, seats)).quantities,
	attach: (params) => autumnClient.billing.attach(params),
	update: (params) => autumnClient.billing.update(params),
};

/**
 * Resolves the registration token and records the license. Returns a claim
 * token for the browser: whoever holds it may link the license to an
 * organization they administer. A repeated token refreshes the claim.
 */
export async function registerAwsMarketplaceCustomer(
	registrationToken: string,
	api: AwsMarketplaceApi = awsMarketplaceApi(),
): Promise<{ claimToken: string }> {
	const config = requireConfig();
	const resolved = await resolveRegistration(
		api,
		registrationToken,
		config.productCode,
	);
	const claimToken = randomBytes(32).toString("base64url");
	const claim = {
		claimTokenHash: hashClaim(claimToken),
		claimExpiresAt: new Date(Date.now() + CLAIM_TTL_MS),
	};
	await db
		.insert(awsMarketplaceCustomers)
		.values({ ...resolved, ...claim })
		.onConflictDoUpdate({
			target: awsMarketplaceCustomers.licenseArn,
			set: {
				awsAccountId: resolved.awsAccountId,
				customerIdentifier: resolved.customerIdentifier,
				agreementId: sql`coalesce(${resolved.agreementId}, ${awsMarketplaceCustomers.agreementId})`,
				...claim,
			},
		});
	return { claimToken };
}

async function findByClaim(
	claimToken: string,
): Promise<SelectAwsMarketplaceCustomer | "not_found" | "expired"> {
	const row = await db.query.awsMarketplaceCustomers.findFirst({
		where: eq(awsMarketplaceCustomers.claimTokenHash, hashClaim(claimToken)),
	});
	if (!row) return "not_found";
	if (!row.claimExpiresAt || row.claimExpiresAt <= new Date()) return "expired";
	return row;
}

async function manageableOrganizations(userId: string) {
	return db
		.select({ id: organizations.id, name: organizations.name })
		.from(members)
		.innerJoin(organizations, eq(members.organizationId, organizations.id))
		.where(and(eq(members.userId, userId), inArray(members.role, LINK_ROLES)));
}

export type AwsMarketplaceClaim =
	| { status: "not_found" }
	| { status: "expired" }
	| {
			status: "unlinked";
			organizations: Array<{ id: string; name: string }>;
	  }
	| {
			status: "linked";
			organization: { id: string; name: string } | null;
	  };

export async function awsMarketplaceClaim(
	claimToken: string,
	userId: string,
): Promise<AwsMarketplaceClaim> {
	const row = await findByClaim(claimToken);
	if (row === "not_found") return { status: "not_found" };
	if (row === "expired") return { status: "expired" };
	if (!row.organizationId) {
		return {
			status: "unlinked",
			organizations: await manageableOrganizations(userId),
		};
	}
	const [organization] = await db
		.select({ id: organizations.id, name: organizations.name })
		.from(members)
		.innerJoin(organizations, eq(members.organizationId, organizations.id))
		.where(
			and(
				eq(members.userId, userId),
				eq(members.organizationId, row.organizationId),
			),
		);
	return { status: "linked", organization: organization ?? null };
}

export type AwsMarketplaceLinkResult =
	| { ok: true; organizationId: string }
	| {
			ok: false;
			reason:
				| "not_found"
				| "expired"
				| "forbidden"
				| "license_linked_elsewhere"
				| "organization_linked_elsewhere"
				| "organization_has_paid_plan";
	  };

/** Links the claimed license to an organization the user owns or administers, then grants its plan. */
export async function linkAwsMarketplaceCustomer(input: {
	claimToken: string;
	userId: string;
	organizationId: string;
}): Promise<AwsMarketplaceLinkResult> {
	requireConfig();
	const row = await findByClaim(input.claimToken);
	if (typeof row === "string") return { ok: false, reason: row };
	if (row.organizationId) {
		if (row.organizationId !== input.organizationId) {
			return { ok: false, reason: "license_linked_elsewhere" };
		}
		await syncAwsMarketplaceLicense({ licenseArn: row.licenseArn });
		return { ok: true, organizationId: row.organizationId };
	}
	const member = await db.query.members.findFirst({
		where: and(
			eq(members.userId, input.userId),
			eq(members.organizationId, input.organizationId),
		),
		columns: { role: true },
	});
	if (!member || !LINK_ROLES.includes(member.role)) {
		return { ok: false, reason: "forbidden" };
	}
	const otherLicense = await db.query.awsMarketplaceCustomers.findFirst({
		where: eq(awsMarketplaceCustomers.organizationId, input.organizationId),
		columns: { id: true },
	});
	if (otherLicense) {
		return { ok: false, reason: "organization_linked_elsewhere" };
	}
	if (await heldAutumnPlanId(input.organizationId)) {
		return { ok: false, reason: "organization_has_paid_plan" };
	}
	const linked = await db
		.update(awsMarketplaceCustomers)
		.set({
			organizationId: input.organizationId,
			linkedByUserId: input.userId,
			linkedAt: new Date(),
		})
		.where(
			and(
				eq(awsMarketplaceCustomers.id, row.id),
				isNull(awsMarketplaceCustomers.organizationId),
			),
		)
		.returning({ id: awsMarketplaceCustomers.id })
		.catch((error: unknown) => {
			if ((error as { code?: string }).code === "23505") return [];
			throw error;
		});
	if (linked.length === 0) {
		return { ok: false, reason: "organization_linked_elsewhere" };
	}
	await syncAwsMarketplaceLicense({ licenseArn: row.licenseArn });
	return { ok: true, organizationId: input.organizationId };
}

function locatorCondition(locator: LicenseLocator) {
	return "licenseArn" in locator
		? eq(awsMarketplaceCustomers.licenseArn, locator.licenseArn)
		: eq(awsMarketplaceCustomers.agreementId, locator.agreementId);
}

export type SyncOutcome = "unknown_license" | "unlinked" | "synced";

/**
 * Reads the license's entitlements from AWS and makes the linked
 * organization's Autumn plan match. `revoke` ends access without asking AWS,
 * for a license AWS has deprovisioned.
 */
export async function syncAwsMarketplaceLicense(
	locator: LicenseLocator,
	options: { revoke?: boolean; api?: AwsMarketplaceApi } = {},
): Promise<SyncOutcome> {
	const config = requireConfig();
	const api = options.api ?? awsMarketplaceApi();
	const row = await db.query.awsMarketplaceCustomers.findFirst({
		where: locatorCondition(locator),
		columns: { licenseArn: true },
	});
	if (!row) return "unknown_license";
	return dbWs.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`aws-marketplace-sync:${row.licenseArn}`}, 0))`,
		);
		const current = await tx.query.awsMarketplaceCustomers.findFirst({
			where: eq(awsMarketplaceCustomers.licenseArn, row.licenseArn),
		});
		if (!current?.organizationId) return "unlinked";
		const target = options.revoke
			? null
			: planFromEntitlements(
					await fetchEntitlements(api, config.productCode, current.licenseArn),
					dimensionPlanIds(config.enterprisePlanId),
					new Date(),
				);
		await applyPlanChange(
			autumnWriter,
			current.organizationId,
			planChange(current, target),
		);
		await tx
			.update(awsMarketplaceCustomers)
			.set({
				status: target ? "active" : "inactive",
				planId: target?.planId ?? null,
				seats: target?.seats ?? null,
				entitlementExpiresAt: target?.expiresAt ?? null,
				entitlementsSyncedAt: new Date(),
			})
			.where(eq(awsMarketplaceCustomers.id, current.id));
		await invalidateOrganizationBilling(current.organizationId);
		return "synced";
	});
}
