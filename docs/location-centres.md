# Nearby help centres

## Implemented

Existing React/Express/PostgreSQL architecture retained. New navigation item: Nearby help centres (desktop sidebar and mobile More menu). Brown/cream styling follows the current theme. UI labels are bundled for English, Tamil, Hindi, Telugu and Kannada; district names have Tamil and English data. Source office names/addresses remain as published, in English.

38 districts from https://lokbhavan.tn.gov.in/districts-of-tamil-nadu/ and 33 matched welfare-office addresses/contacts from https://www.tabcedco.tn.gov.in/WEB/EN/DIST/DBCMWO were imported. Scholarship relevance is established by the welfare department guidance at https://www.bcmbcmw.tn.gov.in/welfschemes.htm. All entries link to their actual directory source. Verification date means source checked, not physical visit or guaranteed current operation. No fake offices, coordinates, hours, phone numbers, document lists or eligibility rules were added. The official district list uses older spelling variants; application district codes are internal slugs, not government codes.

Private help_location schema contains districts, centres, preferences, holidays and reports. No unrelated schema was changed. RLS is enabled without public API policies; direct owner/backend access is used, and public schema access is revoked. Preferences and reports cascade on profile deletion. Coordinates of the user are neither sent nor stored by the module. Only destination addresses are put in map links; opening an external map is user initiated.

Reports are atomically limited to one per centre per bearer session every 30 minutes. Visible counts exclude records older than two hours; expired rows are deleted on the next report. District-scoped SSE contains only aggregate counts. Reconnect sends a fresh snapshot and 30-second refresh accounts for expiry and other server instances. Recorded opening hours are never overwritten by reports. Dates use Asia/Kolkata. Unknown hours are not included in Open now. Browser refreshes opening status each minute. Persisting a district requires separate location consent; withdrawal deletes the stored preference. Consent writes are serialized to avoid an older request restoring a preference after withdrawal.

## Setup and tests

- node --import tsx scripts/setup-centres.ts fetches the official office directory, validates it, installs the isolated schema and upserts source records. Existing PostgreSQL credentials must allow schema creation. It aborts if fewer than 25 usable directory records are parsed. It does not deactivate omitted records automatically.
- node --import tsx --test src/features/centres/core.test.ts
- npm run lint
- npm run build
- Start server then set CENTRES_TEST_ORIGIN to its URL and run node scripts/verify-centres.cjs. It creates a temporary guest, tests district/centre loading, filters, consent, coordinate rejection, atomic cooldown and SSE, and deletes its data afterward.

## Remaining data and acceptance gaps

No current verified 38-district GeoJSON dataset was found in this session. public/location/boundaries.json explicitly marks it unavailable. GPS requests use a 10-second browser timeout and retain coordinates only in component memory. In this deployment, detection offers manual selection because boundaries are absent. Do not claim automatic district detection is production-ready. To enable it, install a provenance-reviewed local manifest with available:true, sourceUrl and GeoJSON features whose properties.districtCode matches the district slug and whose geometry is Polygon or MultiPolygon in WGS84 longitude/latitude. Polygon holes and outside points are handled. No centroid fallback is enabled because verified district-centre coordinates were not supplied, and assigning an outside-Tamil-Nadu user to a nearby district would be misleading.

Imported offices do not provide verified coordinates, weekly hours or required documents. Distance calculations and sorting are implemented for records that have coordinates, but the current directory uses clearly labelled alphabetical ordering. Unknown hours display call-before-travel. Holidays table exists, but no verified holiday dates are imported: data/location/holidays.json is intentionally empty. Administrators must source and review hours/holidays before open/closed predictions are useful. The 90-day stale flag is implemented; recorded source dates should not be reset without rechecking the source.

The directory contains welfare offices only, so CSC/e-Sevai/college filters currently return empty states. The scholarship link is a statewide official resource, not a verified district-specific scholarship catalogue. Dedicated district notices, verified boundaries and centre enrichment remain data-onboarding work. No existing location-specific voice intent router was found, and voice architecture was unchanged. No demo virtual clock exists, so real IST is used. A physical browser GPS/permission interaction, 360px layout and screen-reader check have not yet been performed.

Additional boundary research: the LGD-derived open snapshot at https://bharatlas.com/view/lgd_districts was identified, but downloading its 88.8 MB nationwide GeoJSON timed out after 120 seconds. It was not installed or labelled verified. GPS fallback remains explicit. Nearby help-centre code is lazy-loaded to avoid adding the screen to the initial JS bundle.

Final validation: 17 location, speech and QA regression tests passed; TypeScript checking, production build and git diff whitespace checks passed. Live location API suite passed against the configured database, and all temporary guest data was deleted (HTTP 200). The feature screen builds into a separate lazy-loaded chunk.

Blank-screen regression fixed: stale backend routes returned frontend HTML with HTTP 200, which the generic JSON helper converted to an empty object; the screen then attempted undefined.filter(). District and centre response validation now keeps the screen mounted with an error. District loading no longer waits for preferences. Unknown API routes return JSON 404, and the centres page has a local error boundary. Verified in headless Edge through guest sign-in, centres navigation, all 38 picker options and selecting Chennai to render its sourced office card. TypeScript and build passed. Backend restart is required after adding Express routes; frontend hot reload alone cannot mount them.
