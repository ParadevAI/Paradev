import type { AwsMarketplaceApi } from "./api";

export type RegistrationFailure =
	| "invalid_token"
	| "expired_token"
	| "wrong_product"
	| "missing_license";

export class AwsMarketplaceRegistrationError extends Error {
	constructor(readonly reason: RegistrationFailure) {
		super(`AWS Marketplace registration failed: ${reason}`);
		this.name = "AwsMarketplaceRegistrationError";
	}
}

export interface ResolvedRegistration {
	licenseArn: string;
	awsAccountId: string;
	customerIdentifier: string | null;
	productCode: string;
	agreementId: string | null;
}

const TOKEN_ERRORS: Record<string, RegistrationFailure> = {
	InvalidTokenException: "invalid_token",
	ExpiredTokenException: "expired_token",
};

/** Exchanges the x-amzn-marketplace-token for the buyer's license, for this product only. */
export async function resolveRegistration(
	api: AwsMarketplaceApi,
	token: string,
	productCode: string,
): Promise<ResolvedRegistration> {
	let result: Awaited<ReturnType<AwsMarketplaceApi["resolveCustomer"]>>;
	try {
		result = await api.resolveCustomer(token);
	} catch (error) {
		const reason =
			TOKEN_ERRORS[(error as { name?: string } | null)?.name ?? ""];
		if (reason) throw new AwsMarketplaceRegistrationError(reason);
		throw error;
	}
	if (result.ProductCode !== productCode) {
		throw new AwsMarketplaceRegistrationError("wrong_product");
	}
	if (!result.LicenseArn || !result.CustomerAWSAccountId) {
		throw new AwsMarketplaceRegistrationError("missing_license");
	}
	return {
		licenseArn: result.LicenseArn,
		awsAccountId: result.CustomerAWSAccountId,
		customerIdentifier: result.CustomerIdentifier ?? null,
		productCode: result.ProductCode,
		agreementId: result.Metadata?.AgreementId ?? null,
	};
}
