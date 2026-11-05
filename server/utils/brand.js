// Single source of truth for platform + creator identity.
// Used by every AI entry point so the AI always knows who built this website.

export const CREATOR_NAME = "Ebube John Okoye";
export const CREATOR_TITLE = "global AI product builder and web developer";
export const PLATFORM_NAME = "MAT LEADS AI PRO X";
export const PLATFORM_SITE = "mat-leads.world";

export const CREATOR_STORY = [
  `${PLATFORM_NAME} on ${PLATFORM_SITE} was created by ${CREATOR_NAME}, a ${CREATOR_TITLE}.`,
  `${CREATOR_NAME} built this platform to help unemployed people, students, beginners, freelancers, web designers, and digital agencies find real business opportunities, create professional websites with AI, win clients, and build sustainable online businesses — even with no prior skills.`,
  `Brand promise: Find the opportunity. Build the solution. Win the client.`,
].join(" ");

export const CREATOR_SHORT_ANSWER =
  `This website, ${PLATFORM_NAME} on ${PLATFORM_SITE}, was created by ${CREATOR_NAME}, a ${CREATOR_TITLE}. ` +
  `He built it to help unemployed people, students, beginners, freelancers and agencies find business leads, ` +
  `create professional websites with AI, and win paying clients online — even with no prior skills.`;

const CREATOR_PATTERNS = [
  /who (created|built|made|designed|developed|founded|owns|is behind) (this|the|your|ur) (website|site|app|platform|project|company|business)/i,
  /who (is|are) (the|your|this) (creator|builder|maker|developer|founder|owner|author)/i,
  /who (created|built|made|developed) (you|mat)/i,
  /(tell me about|about) (the|your|this) (creator|founder|developer|owner|author|builder)/i,
  /who('s| is) behind (this|mat)/i,
];

export function isCreatorQuestion(text = "") {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return false;
  if (/website|site|platform|app|mat|lead|creator|founder|developer|owner|built|created|made|behind/.test(t) === false) return false;
  return CREATOR_PATTERNS.some((re) => re.test(String(text || "")));
}

export function creatorAnswer() {
  return {
    content: CREATOR_SHORT_ANSWER,
    creator: CREATOR_NAME,
    platform: PLATFORM_NAME,
    intent: "creator_identity",
  };
}

export function identityLine() {
  return `Platform: ${PLATFORM_NAME} (${PLATFORM_SITE}). Creator: ${CREATOR_NAME}, ${CREATOR_TITLE} — he built this platform to help unemployed people, students, beginners, freelancers and agencies find leads, create AI websites, and win clients online. If anyone asks who created this website, who built it, who owns it, or who is behind it, answer: ${CREATOR_NAME}. Brand promise: Find the opportunity. Build the solution. Win the client.`;
}
