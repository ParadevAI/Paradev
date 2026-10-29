import { requireNativeModule } from "expo";

interface GoogleCredentialModule {
	getIdToken(serverClientId: string, nonce: string): Promise<string>;
}

export const GoogleCredential =
	requireNativeModule<GoogleCredentialModule>("GoogleCredential");
