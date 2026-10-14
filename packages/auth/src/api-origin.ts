import { env } from "./env";
import { localMode } from "./local-mode";

/**
 * The origin this installation answers on. A personal installation has no
 * hosted api.superset.sh to point at, so it addresses itself — every issuer,
 * audience, redirect and job URL derives from this rather than the hosted
 * environment variables, which are unset in that build.
 *
 * Kept out of local-mode.ts on purpose: that module is imported by nearly
 * everything in this package, and giving it an `env` dependency drags the
 * validated environment (and the analytics client behind it) into module
 * graphs that only wanted the boolean.
 */
export const apiOrigin = localMode
	? (process.env.SUPERESTSET_API_ORIGIN ?? "http://127.0.0.1:1")
	: env.NEXT_PUBLIC_API_URL;
