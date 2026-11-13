import type { useCheckoutGitStatusQuery } from "./hooks/useCheckoutGitStatusQuery";

export type CheckoutGitStatus = Pick<
	ReturnType<typeof useCheckoutGitStatusQuery>,
	"data" | "isLoading" | "isFetching" | "isError" | "error"
>;
