import { hashQuotaScope } from "./quota-cooldown-store";
import { verifiedNativeClaudeQuotaScope } from "./quota-identity";

export interface NativeClaudeCredential {
	accessToken: string;
	canonicalProfile: string;
	registrationHash: string;
}

export function nativeClaudeCredentialGeneration(
	credential: NativeClaudeCredential,
): string {
	return hashQuotaScope([
		"native-claude-generation-v1",
		credential.canonicalProfile,
		credential.registrationHash,
		credential.accessToken,
	]);
}

/** Cache-only binding. A cold launch may retain quarantined counters, never quota authority. */
export function createNativeClaudeScopeResolver({
	readCurrent,
	canonicalize,
	peekQuota,
	now = () => Date.now(),
}: {
	readCurrent(selection: string | null): Promise<NativeClaudeCredential | null>;
	canonicalize(directory: string): Promise<string | null>;
	peekQuota(token: string): object | undefined;
	now?: () => number;
}) {
	const generation = nativeClaudeCredentialGeneration;
	async function read(
		selection: string | null,
		expectedDirectory: string,
		expectedIdentity: string,
	) {
		const directory = await canonicalize(expectedDirectory);
		if (!directory) return null;
		const current = await readCurrent(selection);
		return current &&
			current.canonicalProfile === directory &&
			current.registrationHash === expectedIdentity &&
			(await canonicalize(expectedDirectory)) === directory
			? current
			: null;
	}
	async function capture(
		selection: string | null,
		expectedDirectory: string,
		expectedIdentity: string,
	) {
		if (!/^[a-f0-9]{64}$/.test(expectedIdentity)) return null;
		try {
			const current = await read(
				selection,
				expectedDirectory,
				expectedIdentity,
			);
			const next =
				current && (await read(selection, expectedDirectory, expectedIdentity));
			if (!current || !next || generation(current) !== generation(next))
				return null;
			return { credential: current, generation: generation(current) };
		} catch {
			return null;
		}
	}
	return {
		async captureGeneration(
			selection: string | null,
			expectedDirectory: string,
			expectedIdentity: string,
		) {
			return (
				(await capture(selection, expectedDirectory, expectedIdentity))
					?.generation ?? null
			);
		},
		async resolve(
			selection: string | null,
			expectedDirectory: string,
			expectedIdentity: string,
			expectedGeneration?: string,
		) {
			if (
				!/^[a-f0-9]{64}$/.test(expectedIdentity) ||
				(expectedGeneration !== undefined &&
					!/^[a-f0-9]{64}$/.test(expectedGeneration))
			)
				return null;
			let credential: NativeClaudeCredential | null;
			try {
				credential = await read(selection, expectedDirectory, expectedIdentity);
			} catch {
				return null;
			}
			if (!credential) return null;
			const capturedGeneration = generation(credential);
			if (
				expectedGeneration !== undefined &&
				capturedGeneration !== expectedGeneration
			)
				return null;
			const quota = peekQuota(credential.accessToken);
			const scope = quota
				? verifiedNativeClaudeQuotaScope(
						quota,
						credential.accessToken,
						credential.canonicalProfile,
						expectedIdentity,
						now(),
					)
				: null;
			// The cached proof check is also fenced against a credential replacement during lookup.
			try {
				const next = await read(selection, expectedDirectory, expectedIdentity);
				if (
					!next ||
					generation(next) !== capturedGeneration ||
					(await canonicalize(expectedDirectory)) !==
						credential.canonicalProfile
				)
					return null;
			} catch {
				return null;
			}
			if (!scope) return null;
			return hashQuotaScope([
				"native-claude-scope-v1",
				scope,
				capturedGeneration,
			]);
		},
	};
}
