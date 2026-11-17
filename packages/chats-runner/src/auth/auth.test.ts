import { describe, expect, test } from "bun:test";
import { exportJWK, exportSPKI, generateKeyPair, SignJWT } from "jose";
import {
	createTokenVerifier,
	importPublicKey,
	TokenError,
	tokenFromProtocols,
} from "./auth.ts";

const { privateKey, publicKey } = await generateKeyPair("ES256", {
	extractable: true,
});
const verify = createTokenVerifier({ publicKey, boxId: "box-1" });

const sign = (
	claims: Record<string, unknown>,
	opts: { aud?: string; exp?: string | number; key?: CryptoKey } = {},
) => {
	const jwt = new SignJWT({ sid: "group-1", scope: "control", ...claims })
		.setProtectedHeader({ alg: "ES256" })
		.setAudience(opts.aud ?? "box-1");
	if (opts.exp !== undefined) jwt.setExpirationTime(opts.exp);
	else jwt.setExpirationTime("2m");
	return jwt.sign(opts.key ?? privateKey);
};

describe("box tokens", () => {
	test("a control or watch token for this box grants its scope and session", async () => {
		expect(await verify(await sign({}))).toEqual({
			scope: "control",
			sessionId: "group-1",
		});
		expect(
			await verify(await sign({ scope: "watch", sid: "group-2" })),
		).toEqual({ scope: "watch", sessionId: "group-2" });
	});

	test("rejects a token for another box, an unknown scope, an expired token, and a foreign signature", async () => {
		const other = await generateKeyPair("ES256");
		const bad = [
			await sign({}, { aud: "box-2" }),
			await sign({ scope: "dev" }),
			await sign({}, { exp: Math.floor(Date.now() / 1000) - 10 }),
			await sign({}, { key: other.privateKey }),
			await new SignJWT({ sid: "group-1", scope: "control" })
				.setProtectedHeader({ alg: "ES256" })
				.setAudience("box-1")
				.sign(privateKey),
			"not-a-jwt",
		];
		for (const token of bad)
			await expect(verify(token)).rejects.toBeInstanceOf(TokenError);
	});

	test("the public key may be SPKI PEM (with escaped newlines from an env file) or a JWK", async () => {
		const pem = await exportSPKI(publicKey);
		const token = await sign({});
		for (const text of [
			pem,
			pem.replace(/\n/g, "\\n"),
			JSON.stringify(await exportJWK(publicKey)),
		]) {
			const v = createTokenVerifier({
				publicKey: await importPublicKey(text),
				boxId: "box-1",
			});
			expect((await v(token)).scope).toBe("control");
		}
	});

	test("the token travels as a websocket subprotocol next to `acp`", () => {
		expect(tokenFromProtocols("acp, eyJ.abc.def")).toBe("eyJ.abc.def");
		expect(tokenFromProtocols("eyJ.abc.def")).toBeNull();
		expect(tokenFromProtocols("acp")).toBeNull();
		expect(tokenFromProtocols(undefined)).toBeNull();
	});
});
