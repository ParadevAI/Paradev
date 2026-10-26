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
	async function capture(
		selection: string | null,
		expectedDirectory: string,
		expectedIdentity: string,
	) {
		if (!/^[a-f0-9]{64}$/.test(expectedIdentity)) return null;
		try {
			const directory = await canonicalize(expectedDirectory);
			if (!directory) return null;
			const current = await readCurrent(selection);
			if (
				!current ||
				current.canonicalProfile !== directory ||
				current.registrationHash !== expectedIdentity
			)
				return null;
			const next = await readCurrent(selection);
			if (
				!next ||
				generation(current) !== generation(next) ||
				(await canonicalize(expectedDirectory)) !== directory
			)
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
			const captured = await capture(
				selection,
				expectedDirectory,
				expectedIdentity,
			);
			if (
				!captured ||
				(expectedGeneration !== undefined &&
					captured.generation !== expectedGeneration)
			)
				return null;
			const { credential } = captured;
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
			if (!scope) return null;
			// The cached proof check is also fenced against a credential replacement during lookup.
			try {
				const next = await readCurrent(selection);
				if (
					!next ||
					generation(next) !== captured.generation ||
					(await canonicalize(expectedDirectory)) !==
						credential.canonicalProfile
				)
					return null;
			} catch {
				return null;
			}
			return hashQuotaScope([
				"native-claude-scope-v1",
				scope,
				captured.generation,
			]);
		},
	};
}
