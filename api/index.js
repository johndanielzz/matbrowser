import { handleRequest } from "../server/nativeApp.js";

export default function handler(req, res) {
  return handleRequest(req, res);
}

// Vercel Hobby default is 10s — AI website builds were killed with "TIMED_OUT".
// Give the function 60s (Hobby max) so the 20s AI attempt + fallback always finish.
// vercel.json also declares this limit; keeping the function-local declaration
// makes direct Vercel function detection safe when project settings change.
export const config = { maxDuration: 60 };
