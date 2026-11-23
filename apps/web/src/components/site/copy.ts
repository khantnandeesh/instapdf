/** Site-wide strings (spec F2 H-8). Our own wording. */
export const siteCopy = {
  homeTitle: "Free PDF Tools Online, Private and Fast | BerryPDF",
  homeDescription: "Free online PDF tools that run in your browser: no sign-up, no watermark, nothing to install. Your files stay on your device.",
  logoLabel: "BerryPDF home",
  skip: "Skip to main content",
  menuButton: "All tools",
  menuClose: "Close all tools",
  shortcutsLabel: "Quick links",
  heroTitle: "Fast, private PDF tools",
  heroPitch: "Edit, convert and organize PDFs, right in your browser.",
  heroCta: "Find a tool",
  trustUpload: "Most tools never upload your files",
  soonHeading: "Coming soon",
  soonCta: "Browse all tools",
  available: "Ready now",
  placeholderBody: "We're writing this page. Check back soon.",
  placeholderBack: "Back to all tools",
  notFoundTitle: "We couldn't find that page",
  notFoundBody: "The link may be old or mistyped.",
  footerAllTools: "All tools",
  leaveTitle: "Leave this tool?",
  leaveBody: "Your files and changes here will be lost.",
  leaveStay: "Stay",
  leaveGo: "Leave",
};

/** Footer info pages. About, Help and Security are still placeholders (F21); the legal ones are real (Q1). */
export const infoPages = {
  about: "About",
  help: "Help",
  privacy: "Privacy",
  terms: "Terms",
  cookies: "Cookies",
  security: "Security",
  licenses: "Licenses",
} as const;

export type InfoSlug = keyof typeof infoPages;
