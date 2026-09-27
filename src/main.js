// Entry point. Paints the loading screen immediately, then starts the
// connect/sign-in sequence; everything after that is driven by `state`
// changes flowing back through render().

import { render } from "./ui/app.js";
import { init } from "./boot.js";
import { enableHistory } from "./ui/navigation.js";

enableHistory();
render();
init();
