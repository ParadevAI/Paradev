import { afterAll, describe, expect, test } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyJWT, verifyUserBearer } from "./verify-jwt";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const server = Bun.serve({
	port: 0,
	fetch: () => Response.json({ keys: [jwk] }),
});
afterAll(() => server.stop(true));
const authUrl = server.url.origin;

function sign(claims: Record<string, unknown>, audience = authUrl) {
	return new SignJWT(claims)
		.setProtectedHeader({ alg: "RS256", kid: "k1" })
		.setIssuer(authUrl)
		.setAudience(audience)
		.setExpirationTime("1h")
		.sign(privateKey);
}

describe("verifyUserBearer", () => {
	test("accepts a token addressed to any listed audience", async () => {
		const token = await sign({ sub: "user-1" }, "https://admin.example/mcp");
		const payload = await verifyUserBearer(token, authUrl, [
			authUrl,
			"https://admin.example/mcp",
		]);
		expect(payload?.sub).toBe("user-1");
	});

	test("rejects a token addressed to another audience", async () => {
		const token = await sign({ sub: "user-1" }, "https://other.example/mcp");
		expect(await verifyUserBearer(token, authUrl, [authUrl])).toBeNull();
	});

	test("rejects a token without a subject", async () => {
		expect(
			await verifyUserBearer(await sign({}), authUrl, [authUrl]),
		).toBeNull();
	});
});

describe("verifyJWT", () => {
	test("reads the claims a Worker acts on", async () => {
		const token = await sign({ sub: "user-1", organizationIds: ["org-1"] });
		expect(await verifyJWT(token, authUrl)).toMatchObject({
			sub: "user-1",
			organizationIds: ["org-1"],
			teamIds: [],
		});
	});

	test("refuses a token that names no organizations", async () => {
		expect(await verifyJWT(await sign({ sub: "user-1" }), authUrl)).toBeNull();
	});
});
