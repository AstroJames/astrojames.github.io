# Website visit counter

`GET /api/visits` reads the authoritative total; `POST /api/visits` records a
browser session from astro-beattie.com or www.astro-beattie.com. OPTIONS
supports their JSON preflight. Reads and errors never increment the counter.

A visit is a browser session with less than 30 minutes between page loads.
Refreshing, navigating and retrying within that window reuse an anonymous UUID.
The browser stores only that temporary session identifier and its timestamp;
it never stores or estimates the total. With browser storage disabled, the
session survives only in memory, so subsequent page loads may count anew.
Separate devices/browsers represent separate visits, not unique people.
Known crawler user agents are excluded. This is an anonymous public counter,
not bot-proof analytics; blocked JavaScript/requests may go uncounted and a
malicious caller could forge sessions. No IPs, names or page paths are saved.

D1 stores an aggregate total, UTC daily aggregates and hashed session IDs.
New-session detection, total/daily increments, and session expiry are one
transaction. Reads use a first-primary session and no-store responses. Expired
session hashes are removed after two days; aggregates survive that cleanup.
Only the new website_visit_* tables are used, independently of scheduler reset.
The migration is additive; do not alter applied migration files.

The total starts at zero with the first recorded visit's UTC date. The previous
counter manufactured browser-local estimates, so it supplies no valid baseline.
The badge displays the start date and refreshes its shared total every minute
while visible. On outage it displays unavailable instead of a cached/fake total.
The existing GoatCounter analytics script is separate from this badge.

Checks: run `node --test test/*.test.mjs` here and
`node --test tests/visitor-counter.test.mjs` at the website root. Live verification
can use GET/OPTIONS and a POST with a known preview-bot user agent to avoid
adding synthetic traffic. Never reset the production counter to clean up tests.
