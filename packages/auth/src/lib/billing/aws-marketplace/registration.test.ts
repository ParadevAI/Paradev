import { describe, expect, test } from "bun:test";
import type { AwsMarketplaceApi } from "./api";
import {
	AwsMarketplaceRegistrationError,
	type RegistrationFailure,
	resolveRegistration,
} from "./registration";

function apiResolving(
	resolveCustomer: AwsMarketplaceApi["resolveCustomer"],
): AwsMarketplaceApi {
	return {
		resolveCustomer,
		getEntitlementsPage: () => {
			throw new Error("not called");
		},
	};
}

function awsError(name: string): Error {
	return Object.assign(new Error(name), { name });
}

async function failure(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected a failure");
}

describe("resolveRegistration", () => {
	test("returns the license of a token for this product", async () => {
		const tokens: string[] = [];
		const api = apiResolving(async (token) => {
			tokens.push(token);
			return {
				ProductCode: "prod-code",
				CustomerAWSAccountId: "123456789012",
				LicenseArn: "arn:aws:license-manager::123456789012:license:l-1",
				Metadata: { AgreementId: "agmt-1" },
			};
		});
		expect(await resolveRegistration(api, "token-1", "prod-code")).toEqual({
			licenseArn: "arn:aws:license-manager::123456789012:license:l-1",
			awsAccountId: "123456789012",
			customerIdentifier: null,
			productCode: "prod-code",
			agreementId: "agmt-1",
		});
		expect(tokens).toEqual(["token-1"]);
	});

	test("rejects a token issued for another product", async () => {
		const api = apiResolving(async () => ({
			ProductCode: "other-product",
			CustomerAWSAccountId: "123456789012",
			LicenseArn: "arn:license",
		}));
		const error = await failure(resolveRegistration(api, "t", "prod-code"));
		expect(error).toBeInstanceOf(AwsMarketplaceRegistrationError);
		expect((error as AwsMarketplaceRegistrationError).reason).toBe(
			"wrong_product",
		);
	});

	test("rejects a result without a license", async () => {
		const api = apiResolving(async () => ({
			ProductCode: "prod-code",
			CustomerIdentifier: "legacy-id",
		}));
		const error = await failure(resolveRegistration(api, "t", "prod-code"));
		expect((error as AwsMarketplaceRegistrationError).reason).toBe(
			"missing_license",
		);
	});

	test.each<[string, RegistrationFailure]>([
		["InvalidTokenException", "invalid_token"],
		["ExpiredTokenException", "expired_token"],
	])("maps %s to %s", async (name, reason) => {
		const api = apiResolving(async () => {
			throw awsError(name);
		});
		const error = await failure(resolveRegistration(api, "t", "prod-code"));
		expect((error as AwsMarketplaceRegistrationError).reason).toBe(reason);
	});

	test("passes other AWS errors through so the caller can retry", async () => {
		const api = apiResolving(async () => {
			throw awsError("ThrottlingException");
		});
		const error = await failure(resolveRegistration(api, "t", "prod-code"));
		expect(error).not.toBeInstanceOf(AwsMarketplaceRegistrationError);
		expect((error as Error).name).toBe("ThrottlingException");
	});
});
