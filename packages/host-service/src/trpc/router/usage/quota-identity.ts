import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";

// Proof belongs to the authenticated response, never to a display email or a
// mutable profile slot. Keep it out of RPC serialization and object spreads.
export interface ClaudeQuotaProof {
	tokenHash: string;
	ownerHash: string;
	registrationHash: string | null;
	verifiedAt: number;
}
const identities = new WeakMap<
	object,
	ClaudeQuotaProof & { authenticated: boolean }
>();
export const CLAUDE_PROOF_MAX_AGE_MS = 6 * 60 * 60_000;
const hash = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function consistentUuid(values: unknown[]): string | null {
	const supplied = values.filter(
		(value) => value !== undefined && value !== null,
	);
	if (
		supplied.length === 0 ||
		supplied.some(
			(value) =>
				typeof value !== "string" ||
				!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
					value,
				),
		)
	)
		return null;
	const normalized = supplied.map((value) => (value as string).toLowerCase());
	return new Set(normalized).size === 1 ? (normalized[0] ?? null) : null;
}

export function claudeProfileIdentity(
	profile: unknown,
): { principal: string; organization: string } | null {
	const root = record(profile);
	if (!root) return null;
	const account = record(root.account);
	const organization = record(root.organization);
	if (
		(root.account != null && !account) ||
		(root.organization != null && !organization)
	)
		return null;
	const principal = consistentUuid([
		account?.uuid,
		root.accountUuid,
		root.account_uuid,
	]);
	const org = consistentUuid([
		organization?.uuid,
		root.organizationUuid,
		root.organization_uuid,
	]);
	return principal && org ? { principal, organization: org } : null;
}

/** Exact public SessionAccount tuple: the absent Claude subject serializes as null. */
export function claudeProfileRegistration(profile: unknown): string | null {
	const identity = claudeProfileIdentity(profile);
	const root = record(profile);
	const account = record(root?.account);
	if (!identity || !root) return null;
	const ids = [account?.uuid, root.accountUuid, root.account_uuid].filter(
		(value) => value != null,
	);
	const emails = [
		account?.email,
		account?.email_address,
		account?.emailAddress,
		root.email,
	].filter((value) => value != null);
	if (
		ids.length === 0 ||
		new Set(ids).size !== 1 ||
		emails.length === 0 ||
		emails.some((value) => typeof value !== "string" || !value.trim()) ||
		new Set(emails).size !== 1
	)
		return null;
	return hash([ids[0], undefined, emails[0]]);
}

export function claudeQuotaProof(
	accessToken: string,
	profile: unknown,
	verifiedAt: number,
): ClaudeQuotaProof | null {
	const identity = claudeProfileIdentity(profile);
	return identity && accessToken.trim() && Number.isFinite(verifiedAt)
		? {
				tokenHash: hash(accessToken),
				ownerHash: hash([identity.principal, identity.organization]),
				registrationHash: claudeProfileRegistration(profile),
				verifiedAt,
			}
		: null;
}

export function validClaudeQuotaProof(
	proof: ClaudeQuotaProof,
	now: number,
): boolean {
	return (
		/^[a-f0-9]{64}$/.test(proof.tokenHash) &&
		/^[a-f0-9]{64}$/.test(proof.ownerHash) &&
		(proof.registrationHash === null ||
			/^[a-f0-9]{64}$/.test(proof.registrationHash)) &&
		Number.isFinite(proof.verifiedAt) &&
		proof.verifiedAt <= now &&
		now - proof.verifiedAt <= CLAUDE_PROOF_MAX_AGE_MS
	);
}

/** Only call with the profile response fetched using this exact access token. */
export function bindClaudeQuotaIdentity<T extends object>(
	quota: T,
	accessToken: string,
	profile: unknown,
	verifiedAt?: number,
): T {
	identities.delete(quota);
	const proof =
		verifiedAt === undefined
			? null
			: claudeQuotaProof(accessToken, profile, verifiedAt);
	if (proof) identities.set(quota, { ...proof, authenticated: true });
	return quota;
}

/** Opaque identity for appearance metadata, independently aged from usage. */
export function verifiedClaudeQuotaOwner(value: object, now = Date.now()) {
	const proof = identities.get(value);
	return proof && validClaudeQuotaProof(proof, now)
		? { identity: proof.ownerHash, verifiedAt: new Date(proof.verifiedAt) }
		: null;
}

export function copyQuotaIdentity<T extends object>(
	source: object,
	target: T,
): T {
	const identity = identities.get(source);
	identities.delete(target);
	if (identity) identities.set(target, identity);
	return target;
}

export function verifiedClaudeQuotaScope(
	quota: object,
	accessToken: string,
	canonicalProfile: string | null,
	now = Date.now(),
): string | null {
	const identity = identities.get(quota);
	return identity &&
		verifiedClaudeQuotaOwner(quota, now) &&
		canonicalProfile &&
		identity.tokenHash === hash(accessToken)
		? hash(["claude-principal-v1", identity.ownerHash, canonicalProfile])
		: null;
}

export async function canonicalQuotaProfile(
	path: string,
): Promise<string | null> {
	if (!isAbsolute(path)) return null;
	try {
		return await realpath(path);
	} catch {
		return null;
	}
}

/** Persisted proof supports dated appearance/history only, never native launch authority. */
export function restoreClaudeQuotaIdentity<T extends object>(
	quota: T,
	proof: ClaudeQuotaProof,
	now = Date.now(),
): T {
	identities.delete(quota);
	if (validClaudeQuotaProof(proof, now))
		identities.set(quota, { ...proof, authenticated: false });
	return quota;
}

export function verifiedNativeClaudeQuotaScope(
	quota: object,
	accessToken: string,
	canonicalProfile: string,
	registrationHash: string,
	now = Date.now(),
): string | null {
	const proof = identities.get(quota);
	if (!proof?.authenticated || proof.registrationHash !== registrationHash)
		return null;
	return verifiedClaudeQuotaScope(quota, accessToken, canonicalProfile, now);
}
