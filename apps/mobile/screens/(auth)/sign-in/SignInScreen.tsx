import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import { useState } from "react";
import { Image, View } from "react-native";

import { Text } from "@/components/ui/text";
import { signIn } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { errorCopy } from "@/lib/errors";
import { openUrl } from "@/lib/open-url";

import { DevSignInOptions } from "./components/DevSignInOptions";
import { EmailSignInLink } from "./components/EmailSignInLink";
import type { SocialProvider } from "./components/SocialButton";
import { SocialButton } from "./components/SocialButton";
import { signInWithApple } from "./utils/signInWithApple";

export function SignInScreen() {
	const appName = BRAND.NAME;
	const [error, setError] = useState<string | null>(null);

	const handleSignIn = async (provider: SocialProvider) => {
		setError(null);
		try {
			await signIn.social({
				provider,
				callbackURL: "/",
			});
		} catch (err) {
			console.error("[sign-in] Error:", err);
			setError(errorCopy(err));
		}
	};

	const handleAppleSignIn = async () => {
		setError(null);
		try {
			await signInWithApple();
		} catch (err) {
			console.error("[sign-in] Apple error:", err);
			setError(errorCopy(err));
		}
	};

	return (
		<View className="flex-1 items-center justify-center gap-8 bg-background p-6">
			<Image
				source={require("@/assets/icon.png")}
				style={{ width: 80, height: 80, borderRadius: 16 }}
			/>

			<View className="items-center gap-2">
				<Text className="text-2xl font-semibold text-foreground">
					<Trans>Welcome to {appName}</Trans>
				</Text>
				<Text className="text-base text-muted-foreground">
					<Trans>Sign in to get started</Trans>
				</Text>
			</View>

			<View className="w-full items-center gap-3">
				<SocialButton
					provider="apple"
					onPress={handleAppleSignIn}
					className="w-4/5 max-w-sm"
				/>
				<SocialButton
					provider="github"
					onPress={() => handleSignIn("github")}
					className="w-4/5 max-w-sm"
				/>
				<SocialButton
					provider="google"
					onPress={() => handleSignIn("google")}
					className="w-4/5 max-w-sm"
				/>
				{(__DEV__ || env.EXPO_PUBLIC_E2E === "1") && <DevSignInOptions />}
				<EmailSignInLink onError={setError} />
			</View>

			{error && (
				<Text className="text-center text-sm text-destructive">{error}</Text>
			)}

			<Text className="text-center text-xs text-muted-foreground/70">
				<Trans>
					By signing in, you agree to our{"\n"}
					<Text
						className="text-xs text-muted-foreground underline"
						onPress={() => openUrl(COMPANY.TERMS_URL)}
					>
						Terms of Service
					</Text>{" "}
					and{" "}
					<Text
						className="text-xs text-muted-foreground underline"
						onPress={() => openUrl(COMPANY.PRIVACY_URL)}
					>
						Privacy Policy
					</Text>
				</Trans>
			</Text>
		</View>
	);
}
