/** Opening text stored as the summary until the optimizer replaces it. */
export const OPENING_SUMMARY_CHARS = 180;

/** A section longer than this is split into child nodes. */
export const DEFAULT_MAX_BODY = 2400;

/** Adjacent leaf siblings shorter than this are merged. */
export const DEFAULT_TINY_BODY = 280;

/** Nodes or documents one optimize pass may consider. */
export const DEFAULT_OPTIMIZE_CAP = 20;

/** Approximate characters per printed page for page_start / page_end. */
export const PAGE_CHARS = 3000;
