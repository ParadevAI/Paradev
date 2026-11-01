import {
	createHash,
	createPublicKey,
	type KeyObject,
	verify,
} from "node:crypto";

const SIGNED_DATA_PREFIX = Buffer.from("CRX3 SignedData\x00", "latin1");

// Chromium's kPublisherKeyHash (components/crx_file/crx_verifier.cc): the
// Chrome Web Store signs every extension it serves with this ECDSA key.
const WEB_STORE_PUBLISHER_KEY_SHA256 =
	"61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf";

const CRX_FILE_HEADER = {
	sha256WithRsa: 2,
	sha256WithEcdsa: 3,
	signedHeaderData: 10000,
} as const;
const ASYMMETRIC_KEY_PROOF = { publicKey: 1, signature: 2 } as const;
const SIGNED_DATA = { crxId: 1 } as const;

interface KeyProof {
	key: KeyObject;
	keySha256: Buffer;
	signature: Buffer;
}

/**
 * Verifies a CRX the way Chrome does before a Web Store install: CRX3 only,
 * every proof's signature valid, the declared ID derived from a signing key,
 * and a signature from the Web Store publisher key. Returns the extension ID.
 */
export function verifyCrx3(crx: Buffer): string {
	if (crx.length < 12 || crx.toString("latin1", 0, 4) !== "Cr24") {
		throw new Error("Refusing a download that is not a CRX file");
	}
	const version = crx.readUInt32LE(4);
	if (version !== 3) {
		throw new Error(`Refusing a CRX${version} file: only CRX3 is accepted`);
	}
	const archiveStart = 12 + crx.readUInt32LE(8);
	if (archiveStart > crx.length) throw new Error("CRX header is truncated");

	const header = readFields(crx.subarray(12, archiveStart));
	const signedHeaderData = single(header, CRX_FILE_HEADER.signedHeaderData);
	const crxId = single(readFields(signedHeaderData), SIGNED_DATA.crxId);
	if (crxId.length !== 16) throw new Error("CRX ID has the wrong length");

	const signedLength = Buffer.alloc(4);
	signedLength.writeUInt32LE(signedHeaderData.length);
	const signedData = Buffer.concat([
		SIGNED_DATA_PREFIX,
		signedLength,
		signedHeaderData,
		crx.subarray(archiveStart),
	]);

	const rsaProofs = readProofs(header, CRX_FILE_HEADER.sha256WithRsa, "rsa");
	const ecdsaProofs = readProofs(header, CRX_FILE_HEADER.sha256WithEcdsa, "ec");
	for (const proof of [...rsaProofs, ...ecdsaProofs]) {
		if (!verify("sha256", signedData, proof.key, proof.signature)) {
			throw new Error("CRX signature does not verify");
		}
	}
	const signedByDeveloper = [...rsaProofs, ...ecdsaProofs].some((proof) =>
		proof.keySha256.subarray(0, 16).equals(crxId),
	);
	if (!signedByDeveloper) {
		throw new Error("CRX signature does not match the extension ID");
	}
	const signedByWebStore = ecdsaProofs.some(
		(proof) =>
			proof.keySha256.toString("hex") === WEB_STORE_PUBLISHER_KEY_SHA256,
	);
	if (!signedByWebStore) {
		throw new Error("CRX has no Chrome Web Store publisher signature");
	}
	return toExtensionId(crxId);
}

function readProofs(
	header: Map<number, Buffer[]>,
	field: number,
	keyType: "rsa" | "ec",
): KeyProof[] {
	return (header.get(field) ?? []).map((encoded) => {
		const proof = readFields(encoded);
		const publicKey = single(proof, ASYMMETRIC_KEY_PROOF.publicKey);
		const key = createPublicKey({
			key: publicKey,
			format: "der",
			type: "spki",
		});
		if (key.asymmetricKeyType !== keyType) {
			throw new Error(`CRX ${keyType} proof carries a different key type`);
		}
		return {
			key,
			keySha256: createHash("sha256").update(publicKey).digest(),
			signature: single(proof, ASYMMETRIC_KEY_PROOF.signature),
		};
	});
}

function single(fields: Map<number, Buffer[]>, field: number): Buffer {
	const values = fields.get(field);
	if (values?.length !== 1)
		throw new Error(`CRX header field ${field} is malformed`);
	return values[0] as Buffer;
}

/** Length-delimited protobuf fields by number; other wire types are skipped. */
function readFields(message: Buffer): Map<number, Buffer[]> {
	const fields = new Map<number, Buffer[]>();
	let offset = 0;
	const readVarint = (): number => {
		let value = 0;
		for (let shift = 0; shift < 49; shift += 7) {
			const byte = message[offset++];
			if (byte === undefined) throw new Error("CRX header is truncated");
			value += (byte & 0x7f) * 2 ** shift;
			if (byte < 0x80) return value;
		}
		throw new Error("CRX header has an oversized varint");
	};
	while (offset < message.length) {
		const key = readVarint();
		const field = Math.floor(key / 8);
		switch (key & 7) {
			case 0:
				readVarint();
				break;
			case 1:
				offset += 8;
				break;
			case 5:
				offset += 4;
				break;
			case 2: {
				const length = readVarint();
				if (offset + length > message.length) {
					throw new Error("CRX header is truncated");
				}
				const values = fields.get(field) ?? [];
				values.push(message.subarray(offset, offset + length));
				fields.set(field, values);
				offset += length;
				break;
			}
			default:
				throw new Error("CRX header has an unknown wire type");
		}
	}
	if (offset > message.length) throw new Error("CRX header is truncated");
	return fields;
}

function toExtensionId(crxId: Buffer): string {
	return [...crxId.toString("hex")]
		.map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
		.join("");
}
