/**
 * Switches for features that are built but turned off.
 *
 * URL import (BeerXML from a web address) goes through the third-party proxy
 * api.allorigins.win, which sees and could change what is imported (#121).
 * Off until it has its own, safe API route; the code stays in place.
 */
export const URL_IMPORT_ENABLED = false;
