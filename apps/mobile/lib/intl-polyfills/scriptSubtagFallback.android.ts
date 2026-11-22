import { withScriptSubtagFallback } from "./withScriptSubtagFallback";

Intl.NumberFormat = withScriptSubtagFallback(Intl.NumberFormat);
Intl.DateTimeFormat = withScriptSubtagFallback(Intl.DateTimeFormat);
