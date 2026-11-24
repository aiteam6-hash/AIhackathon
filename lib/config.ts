// Rename the product here; every screen reads from these constants.
export const PRODUCT_NAME = "Shortlist";
export const PRODUCT_TAGLINE = "Hiring that explains itself";
export const PRODUCT_DESCRIPTION =
  "Filter out ineligible applicants, score the rest against clear criteria, and keep the reasoning visible to both sides.";
export const CONTACT_EMAIL = "hello@shortlist.example";
/** Roles with unreviewed applicants older than this many days show in "needs your attention". */
export const STALE_DAYS = 5;
/** Bump to force a re-seed of localStorage after changing the seed data. */
export const STORE_VERSION = 1;
export const STORE_KEY = "shortlist-demo-store";
