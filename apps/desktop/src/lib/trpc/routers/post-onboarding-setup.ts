import { postOnboardingSetup } from "main/lib/post-onboarding-setup";
import { publicProcedure, router } from "..";

export const createPostOnboardingSetupRouter = () => {
	return router({
		run: publicProcedure.mutation(() => {
			postOnboardingSetup.request();
		}),
	});
};
