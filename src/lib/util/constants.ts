// Definitions
export const EXTENSION_ID = 'SanderRonde.VSCode-Gerrit';

// Refreshing
export const PERIODICAL_GIT_FETCH_INTERVAL = 5000;
export const PERIODICAL_CHANGE_FETCH_INTERVAL = 1000 * 60 * 5;

// Caching
export const CHANGE_CACHE_TIME = 1000 * 60 * 15;

/**
 * Don't allow any writing API requests (only GET)
 */
export const READONLY_MODE = false;
