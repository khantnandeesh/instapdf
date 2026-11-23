/** Site-wide strings (spec F2 H-8). Our own wording. */
export const siteCopy = {
  homeTitle: "InstaPDF · Fast, private PDF tools",
  homeDescription: "Free online PDF tools to organize, edit and convert PDFs. Most tools run in your browser, so your files stay on your device.",
  logoLabel: "InstaPDF home",
  skip: "Skip to main content",
  menuButton: "All tools",
  menuClose: "Close all tools",
  shortcutsLabel: "Quick links",
  heroTitle: "Fast, private PDF tools",
  heroPitch: "Organize, edit and convert PDFs without installing anything. Most tools run right in your browser, so your files stay on your device.",
  heroCta: "Find a tool",
  heroSeeAll: (n: number) => `See all ${n} tools`,
  trustUpload: "Most tools never upload your files",
  trustAccount: "No account needed",
  soonBack: "All tools",
  soonHeading: "Coming soon",
  soonBody: (name: string) => `We're still building ${name}. It isn't ready yet.`,
  soonClient: "When it's ready it will run in your browser, so your files stay on your device.",
  soonServer: "When it's ready, files you add will be processed on our servers and deleted within 2 hours.",
  soonCta: "Browse all tools",
  available: "Ready to use now",
  placeholderBody: "We're writing this page. Check back soon.",
  placeholderBack: "Back to all tools",
  notFoundTitle: "We couldn't find that page",
  notFoundBody: "The link may be old, or the address may have a typo.",
  footerTagline: "Fast, private PDF tools.",
  footerPrivacy: "Browser tools never upload your files.",
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
