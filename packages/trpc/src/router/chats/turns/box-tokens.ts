import {
	type CryptoKey,
	exportPKCS8,
	exportSPKI,
	generateKeyPair,
	importPKCS8,
	importSPKI,
	jwtVerify,
	SignJWT,
} from "jose";

/** Audience of box credentials: only this API accepts them. A box accepts only tokens addressed to its own id. */
const API_AUDIENCE = "chats-api";
/** Only needed to open the connection. */
const BOX_TOKEN_TTL = "2m";

export interface BoxKeys {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
	/** The public key as PEM, given to boxes so they can verify their tokens. */
	publicKeyText: string;
}

const normalize = (text: string) => text.trim().replace(/\\n/g, "\n");

/** Keys as PEM (PKCS8 and SPKI). `\n` escapes from a one-line env value are accepted. */
export async function loadBoxKeys(
	privateText: string,
	publicText: string,
): Promise<BoxKeys> {
	const publicKeyText = normalize(publicText);
	return {
		privateKey: await importPKCS8(normalize(privateText), "ES256"),
		publicKey: await importSPKI(publicKeyText, "ES256"),
		publicKeyText,
	};
}

/** A fresh pair, with its private key as PEM so it can be kept and loaded again. */
export async function generateBoxKeys(): Promise<
	BoxKeys & { privateKeyText: string }
> {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	return {
		privateKey,
		publicKey,
		publicKeyText: await exportSPKI(publicKey),
		privateKeyText: await exportPKCS8(privateKey),
	};
}

/** A token a box accepts: `control` (the API runs a turn) or `watch` (a member streams one session). */
export function signBoxToken(
	keys: BoxKeys,
	input: { boxId: string; scope: "control" | "watch"; sessionId: string },
) {
	return new SignJWT({ scope: input.scope, sid: input.sessionId })
		.setProtectedHeader({ alg: "ES256" })
		.setSubject("chats-api")
		.setAudience(input.boxId)
		.setIssuedAt()
		.setExpirationTime(BOX_TOKEN_TTL)
		.sign(keys.privateKey);
}

/**
 * A box's credential: which Dev's box (`sub`) and which box (`box`, new at
 * every wake). It never enters the box: the box's network proxy adds it to
 * the box's requests to the API. It has no expiry; the API accepts it only
 * while that box is the Dev's current one.
 */
export function signBoxCredential(
	keys: BoxKeys,
	input: { agentId: string; boxId: string },
) {
	return new SignJWT({ scope: "box", box: input.boxId })
		.setProtectedHeader({ alg: "ES256" })
		.setSubject(input.agentId)
		.setAudience(API_AUDIENCE)
		.setIssuedAt()
		.sign(keys.privateKey);
}

/** Null for anything that is not a box credential signed by this API, box tokens signed with the same key included. */
export async function verifyBoxCredential(
	keys: BoxKeys,
	token: string,
): Promise<{ agentId: string; boxId: string } | null> {
	try {
		const { payload } = await jwtVerify(token, keys.publicKey, {
			algorithms: ["ES256"],
			audience: API_AUDIENCE,
			requiredClaims: ["sub", "box"],
		});
		if (payload.scope !== "box" || typeof payload.box !== "string") return null;
		if (typeof payload.sub !== "string") return null;
		return { agentId: payload.sub, boxId: payload.box };
	} catch {
		return null;
	}
}
