import "./styles.css";
import { initAuth } from "./auth.js";

// Boot the journal only after Clerk reports a signed-in session.
// (Sign-in UI, session handling and the user chip live in auth.js)
initAuth(() => import("./app.js"));
