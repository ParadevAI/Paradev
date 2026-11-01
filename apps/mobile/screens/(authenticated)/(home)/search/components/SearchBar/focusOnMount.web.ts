import type { FocusOnMount } from "./focusOnMount.types";

// No sheet transition runs on the web, so no transitionEnd arrives to focus it.
export const focusOnMount: FocusOnMount = true;
