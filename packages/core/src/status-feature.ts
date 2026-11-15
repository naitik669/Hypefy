/**
 * Status is switched off for now.
 *
 * Hidden rather than deleted: every surface below is behind this one flag, so
 * turning it back on is changing false to true. The table, the RPCs, the
 * editor and the bubble component all stay exactly where they are, and no
 * existing status is destroyed — people who set one simply stop seeing it
 * shown until this flips.
 */
export const STATUS_ENABLED = false;
