export const DEFAULT_IMPORT_LIMIT = 5;
export const DEFAULT_TRACKED_LIMIT = 20;
export const DEFAULT_REFRESH_COOLDOWN_HOURS = 6;
export const EMBEDDING_DIMENSIONS = 256;
export const DEFAULT_ANALYSIS_MODEL = "google/gemini-3-flash-preview";
export const DEFAULT_WEB_SEARCH_MAX_RESULTS = 4;

export const SOURCE_DEFAULTS = {
  ebay: {
    maxConcurrency: 6,
    requestsPerMinute: 60,
    retryBackoffSeconds: 180
  },
  kleinanzeigen: {
    maxConcurrency: 2,
    requestsPerMinute: 15,
    retryBackoffSeconds: 600
  }
} as const;
