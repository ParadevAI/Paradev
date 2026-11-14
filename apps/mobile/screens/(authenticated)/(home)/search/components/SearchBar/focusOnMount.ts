import type { FocusOnMount } from "./focusOnMount.types";

// Android focuses on the sheet's transitionEnd instead: at mount the field is not in the header yet.
export const focusOnMount: FocusOnMount = false;
