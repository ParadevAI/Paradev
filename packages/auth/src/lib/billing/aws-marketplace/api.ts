import {
	type Entitlement,
	GetEntitlementsCommand,
	MarketplaceEntitlementServiceClient,
} from "@aws-sdk/client-marketplace-entitlement-service";
import {
	MarketplaceMeteringClient,
	ResolveCustomerCommand,
	type ResolveCustomerResult,
} from "@aws-sdk/client-marketplace-metering";
import { env } from "../../../env";

const MAX_ENTITLEMENT_PAGES = 20;

export type { Entitlement, ResolveCustomerResult };

export interface AwsMarketplaceApi {
	resolveCustomer(registrationToken: string): Promise<ResolveCustomerResult>;
	getEntitlementsPage(input: {
		productCode: string;
		licenseArn: string;
		nextToken?: string;
	}): Promise<{ entitlements: Entitlement[]; nextToken?: string }>;
}

export interface AwsMarketplaceConfig {
	productCode: string;
	sellerAccountId: string | null;
	eventsToken: string | null;
	enterprisePlanId: string;
}

/** Null while the listing has no product code: the integration is off. */
export function awsMarketplaceConfig(): AwsMarketplaceConfig | null {
	if (!env.AWS_MARKETPLACE_PRODUCT_CODE) return null;
	return {
		productCode: env.AWS_MARKETPLACE_PRODUCT_CODE,
		sellerAccountId: env.AWS_MARKETPLACE_SELLER_ACCOUNT_ID ?? null,
		eventsToken: env.AWS_MARKETPLACE_EVENTS_TOKEN ?? null,
		enterprisePlanId: env.AWS_MARKETPLACE_ENTERPRISE_PLAN_ID,
	};
}

let sdkApi: AwsMarketplaceApi | null = null;

/** Credentials come from the AWS_MARKETPLACE_* keys, else the SDK's default chain (an IAM role). */
export function awsMarketplaceApi(): AwsMarketplaceApi {
	if (sdkApi) return sdkApi;
	const clientConfig = {
		region: env.AWS_MARKETPLACE_REGION,
		...(env.AWS_MARKETPLACE_ACCESS_KEY_ID &&
		env.AWS_MARKETPLACE_SECRET_ACCESS_KEY
			? {
					credentials: {
						accessKeyId: env.AWS_MARKETPLACE_ACCESS_KEY_ID,
						secretAccessKey: env.AWS_MARKETPLACE_SECRET_ACCESS_KEY,
					},
				}
			: {}),
	};
	const metering = new MarketplaceMeteringClient(clientConfig);
	const entitlement = new MarketplaceEntitlementServiceClient(clientConfig);
	sdkApi = {
		resolveCustomer: (registrationToken) =>
			metering.send(
				new ResolveCustomerCommand({ RegistrationToken: registrationToken }),
			),
		getEntitlementsPage: async ({ productCode, licenseArn, nextToken }) => {
			const result = await entitlement.send(
				new GetEntitlementsCommand({
					ProductCode: productCode,
					Filter: { LICENSE_ARN: [licenseArn] },
					MaxResults: 25,
					...(nextToken ? { NextToken: nextToken } : {}),
				}),
			);
			return {
				entitlements: result.Entitlements ?? [],
				nextToken: result.NextToken,
			};
		},
	};
	return sdkApi;
}

/** Every entitlement of one license. A page can be empty and still carry a NextToken. */
export async function fetchEntitlements(
	api: AwsMarketplaceApi,
	productCode: string,
	licenseArn: string,
): Promise<Entitlement[]> {
	const all: Entitlement[] = [];
	let nextToken: string | undefined;
	for (let page = 0; page < MAX_ENTITLEMENT_PAGES; page++) {
		const result = await api.getEntitlementsPage({
			productCode,
			licenseArn,
			nextToken,
		});
		all.push(...result.entitlements);
		nextToken = result.nextToken;
		if (!nextToken) return all;
	}
	throw new Error(
		`GetEntitlements for ${licenseArn} returned more than ${MAX_ENTITLEMENT_PAGES} pages`,
	);
}
