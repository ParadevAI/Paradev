import { createHmac, timingSafeEqual } from "node:crypto";

export function signDrainBody(body: string, secret: string): string {
	return createHmac("sha1", secret).update(body, "utf8").digest("hex");
}

export function verifyDrainSignature({
	body,
	signature,
	secret,
}: {
	body: string;
	signature: string | null;
	secret: string;
}): boolean {
	if (!signature) return false;
	const expected = Buffer.from(signDrainBody(body, secret));
	const received = Buffer.from(signature);
	return (
		expected.length === received.length && timingSafeEqual(expected, received)
	);
}
