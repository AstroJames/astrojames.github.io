# astrojames.github.io

Personal website for James Beattie built with [Hugo Blox Builder](https://hugoblox.com/) on top of Hugo. The repo hosts profile material (news, projects, publications, talks) plus richer assets such as movies and 3D point-cloud viewers.

## Live finite-volume walkthrough

`static/outreach/riemann-lab/` is a single-page, guided numerical experiment.
Example, reconstruction, RK method and grid controls sit together above the live
solution and four keyboard-operable steps: averages → reconstruction → face flux
→ update. One operation and one selected face are shown at a time. The same blue
cell and gold/purple faces link the diagrams. Detailed equations, live weight
tables, comparison controls and diagnostics open on demand.

Examples include periodic scalar advection (smooth/sine/square pulses) and the
Sod/Lax Euler shock tubes. Grids offer powers of two from 16 through 4,096 cells. The
reconstructions are piecewise constant, PLM minmod/MC, monotone PPM, unlimited
fifth order, MP5, WENO-JS5/7/9, WENO-Z5, CWENO5, and fixed-cutoff TENO5/6. Both face states have explicit stencil maps. WENO/TENO plots
show every candidate across its full support, including the cubic in TENO6
and the five quartics in WENO-JS9, with
candidate face dots and a separate weighted-value diamond. Rejected TENO curves
remain inspectable. Ghost labels identify wrapped/clamped samples. An optional
unlimited quartic reference is available for five-cell schemes. The separate
Unlimited 5 method uses that polynomial in the scalar solver. CWENO5 displays
its combined polynomial inside the donor cell; MP5 displays the unlimited
quartic, limiter bounds, and final face value.

WENO-Z5 uses power 2 and epsilon 1e-40. TENO5 uses C=1, power 6, cutoff 1e-5
and the same epsilon. TENO6 uses cutoff 1e-7 and weights (0.05, 0.45, 0.3, 0.2)
on left/central/right/wide-right candidates. WENO-JS5/7/9 use power 2 and
epsilon 1e-6. CWENO5 uses epsilon=Δx² and weights (3/4, 1/16, 1/8, 1/16). The exact
reconstruction and RK equations use LaTeX rendered by locally hosted KaTeX
0.19.1, with accessible MathML. Math assets, fonts and licenses live in `vendor/`.
No CDN, npm install or build step is required to run the lab.

Forward Euler, SSPRK2, SSPRK3 and classical RK4 switch live without resetting
conserved states or time. Both solves use the same integrator and CFL≤0.35
(reduced to 0.2 if either uses MP5, with α=4).
Playback schedules complete CFL steps and cannot change their numerical result.
Run has no fixed end time. Pause, restart, or switching tabs stops playback.
Periodic advection keeps circulating; shock tubes continue through outflow
boundaries. Exact-reference diagnostics are hidden after a shock-tube wave
reaches a boundary.
Boundary fluxes use the selected RK weights. The update preview shows the full
Euler step, first SSP predictor or first RK4 midpoint, with the matching formula.

First-order flux correction (FOFC) is an optional live switch for both gas
solves. It tests predicted RK states, replaces both faces of troubled cells
with donor-cell LLF fluxes, and rechecks. A separate guard handles nonphysical
reconstructed face inputs. The lab uses zero positivity thresholds without
floors, and replays contributing RK stages consistently. It is an adaptation
of AthenaK’s stage-local algorithm, including iterative rechecking. Scalar
advection is unchanged. Step 3 shows the actual flux inputs, LLF equations and
correction reason; amber markers and counters report the last accepted step.
The Sod/TENO6/Forward Euler preset demonstrates the correction.

The main plot marks and reports excursions beyond the exact instantaneous
signal/density range. Physical shock compression is included in that range.
Candidate-curve excursions beyond input means are a separate reconstruction
diagnostic. The 16-cell square-pulse preset makes TENO ringing visible.
Inspect overshoot pauses at the main solution’s largest excursion and shows
16 nearby cells. Cell arrows pan the view; Full domain restores the overview.
Larger grids do not necessarily produce larger overshoots.

The [solver audit](docs/riemann-lab-audit.md) records 55 automated tests, exact
SymPy identities, browser checks, and the original six-method 720-preset sweep through 512 cells.
The three finer grids have additional short-run conservation and browser checks;
they have not undergone the full-time sweep. With FOFC off, 714 presets
complete with conservation residuals below 2e-14. Six Forward-Euler/TENO5
shock-tube configurations lose positive reconstructed pressure and stop. This
limitation is labeled in the UI when correction is off. A separate 264-case check covers the seven
new methods at 16/64 cells with all RK choices: 263 complete and one
TENO6/Forward-Euler/Sod/64 case stops on a nonpositive reconstructed face.
The maximum normalized conserved-component residual in that FOFC-off audit is 5.47e-13. Face states are checked before HLLE; no floors
or clipping are added. A numerical stop preserves the last physical solution.
Changing reconstruction, RK method or FOFC after a stop clearly restarts the experiment.

With FOFC on, all 204 tested gas cases complete with positive stored states
and normalized conserved-component residuals below 1.86e-14. This covers all
gas methods and RK choices at 16/64 cells, plus TENO5/6 with Forward Euler
at 128/256/512 cells.

Method order refers to smooth scalar reconstruction, not the full RK time
discretization or primitive-variable Euler extension. CWENO5 is accurate
throughout its donor cell; WENO/TENO target face values. Unlimited 5 is an
advection-only ringing diagnostic. The high-order Euler flux is HLLE; corrected faces use donor-cell LLF. See the
audit for the exact scope and stability limits.

Preview with `python -m http.server 8765 --directory static`, then open
`http://localhost:8765/outreach/riemann-lab/`. Run:

```sh
node --test test/riemann-lab.test.mjs test/riemann-lab-audit.test.mjs test/riemann-higher-order.test.mjs test/riemann-fofc.test.mjs
python test/riemann-reconstruction-symbolic.py  # optional, requires SymPy
node scripts/audit-riemann-lab.mjs             # original six-method 720-preset sweep
node scripts/audit-riemann-new-methods.mjs     # 264-case new-method audit
node scripts/audit-riemann-fofc.mjs            # 204 FOFC-on gas cases
python scripts/generate-reconstruction-tables.py # exact SymPy table generation/checks
```

The page is unlisted (`noindex`, excluded from Pagefind, no menu link). Hugo
copies the page modules and vendored assets verbatim on deployment.

## Structure & Customizations

- `content/` – Markdown source for pages, posts, and collections (e.g., `projects/`, `notes/`, `publication/`).
- `static/` – Files published verbatim. 3D assets (glTF `.gltf/.bin`) live in `static/models/` so they can be streamed directly by the Movies page.
- `assets/media/` – Hugo pipeline media (videos, images) consumed by shortcodes. Videos go under `assets/media/movies/` so the `video` shortcode can process them.
- `config/` + `hugoblox.yaml` – Site configuration, menus, and widget ordering.
- `layouts/` – Theme overrides:
  - `layouts/projects/list.html` – custom project grid with hover effects and responsive cards.
  - `layouts/notes/list.html` – stylized list view for Talks/Notes with buttons for PDF/Slides/Video.
  - `layouts/publication/ads-widget.html` – custom ADS import widget.
  - `layouts/partials/publication-item.html` – overrides publication cards (badges, CTA buttons, metadata).
  - `layouts/cv/single.html` – tailored CV layout for the `/cv/` page.
  - `layouts/movies/list.html` – gives the Movies page the same wide hero treatment as Projects.
  - `layouts/shortcodes/model_viewer.html` – wraps `<model-viewer>` and injects the required script once per page.

## Development

Because the repo uses Hugo modules, avoid checking in `_vendor/` (already gitignored). Videos should go in `assets/media/` so the built-in shortcodes can process them, while raw models can stay under `static/`.

## Adding Movies or Models

1. Drop MP4s in `assets/media/movies/` and reference them via the `video` shortcode in `content/movies/_index.md`.
2. Convert volumetric models to glTF and add them to `static/models/`:
   ```bash
   python scripts/ply_to_gltf.py static/models/your_model.ply static/models/your_model
   ```
   Then embed them with the `model_viewer` shortcode, e.g. `{{< model_viewer src="/models/your_model.gltf" alt="Demo" >}}`.

## Publications and News

The publication browser uses the automatically refreshed `data/publications.json`
and renders all records in date order, including when JavaScript is unavailable.
Search covers titles, authors, abstracts, and displayed topics; year, topic, and
authorship filters can be combined. Run `node --test test/publications.test.mjs`
to check search and ordering behavior.

Keep verified preprint links and optional `code_url` / `data_url` links in
`data/publication_resources.yaml`, keyed by the record's ADS bibcode. These
editorial additions survive automated ADS refreshes. Broad topic rules are in
`data/publication_topics.yaml` and apply to newly imported titles as well.
Imported abstracts allow only attribute-free superscript, subscript, and emphasis
markup; the rest is escaped.

Papers missing from ADS can be added to `data/publication_fallbacks.yaml` using
verified arXiv metadata. The publication list merges these at build time, so an
ADS refresh cannot remove them. An ADS record with the same arXiv identifier or
normalized title takes precedence, including journal records carrying the arXiv
identifier. The importer retains ADS identifiers for this matching. Fallback
entries link directly to arXiv and do not display an unverified ADS link.

Recent News shows three posts directly below the biography, with an archive link
and no automatic rotation. Posts marked `news_pinned: true` appear first with a
Featured label; remaining places use the newest posts. The archive keeps its
chronological ordering. Add news as a `content/post/` page bundle
with a title, date, summary, and body. Use `news_date` for a month-only date label
when an exact date is not known.

## Colors

The `slate-blue` Hugo theme in `assets/css/themes/slate-blue.css` defines the
shared accent, text, background, surface, and border colors, including light-mode
fallbacks. Custom sections use the same `--site-*` variables. Global link,
button, and navigation rules live in `assets/css/site-theme.css`; avoid adding
another page-specific accent or global hover override. Scientific figures and
their color scales are unchanged.

## Informal Meetings

The navigation links to `/informal-meetings/`, with separate pages for Advances
in Magnetohydrodynamics (AIM) at the IAS and Magnetogenesis. Edit the matching file in
`data/informal_meetings/` to maintain each series. The four initial weekly slots
are explicitly unconfirmed; blank dates, speakers, and locations remain labeled
as such. Set the series day, time, timezone, location, and optional online link
when agreed. Content in these files appears on the public website.

Copy a session entry to add a week, giving it a unique `id`. Each supports:

- `date` (`"YYYY-MM-DD"`), `time` (`"HH:MM"`), and optional location/online-link overrides.
- `speaker`, `affiliation`, `title`, `format`, and a short `abstract`.
- `materials`: a list of `{label, url}` entries for papers, slides, code, or notes.
- `preparation`, `questions` (a list), and `notes` (Markdown).
- `actions`: a list of `{task, owner, status}` follow-up items.
- `status`: `planning`, `confirmed`, `completed`, or `cancelled`.

Dated planning/confirmed sessions are sorted chronologically in the schedule;
undated slots appear under Open weekly slots. Mark sessions `completed` or
`cancelled` to move them into the archive without losing materials or notes.
The series-level `topics` and `resources` lists support future session planning
and shared reading. Updates follow the site's normal commit/deploy workflow.
The Propose a session link opens an email to `beattie@ias.edu`.

Run the meeting-template checks with
`HUGO_BIN=/path/to/hugo python -m unittest discover -s test -p 'test_meetings.py'`.

## Deployment

### Shared weekly scheduler

“Find a meeting time” in the upper-right corner of Informal Meetings opens
[the hosted scheduler](https://schedule.astro-beattie.com).
The link is configured by `meeting_scheduler_url` in
`config/_default/params.yaml`. GitHub Pages continues to host the main website;
the scheduler runs separately on Sites with a persistent D1 database.

The grid covers Monday–Friday, 9 a.m.–5 p.m. Eastern. James’s hours stay shaded
red in both calendar views; participants can select overlapping hours without
changing his. Suggested times require James to be available. Changes save
immediately, and visible calendars refresh every 15 seconds when no edit is
pending. Names and selected hours are public to schedule visitors.

Participants join by name. A Secure, HttpOnly session cookie lets each browser
edit only its own record for up to 30 days. James uses **Sign in as organizer**
with his ChatGPT account. Sites provides the verified identity; the Worker
checks it against the configured owner email on every protected request.
Other signed-in accounts gain no organizer permissions. Clearing responses
removes all other people, slots, and sessions in one database operation,
while preserving James’s exact availability. No organizer key is shipped in
public code, and the local preview’s private links do not grant hosted access.

Hosted source lives in `scheduler-hosted/`. The UI remains shared with the Hugo
draft; run `node scripts/sync-scheduler-site.mjs` from the repository root after
editing the scheduler template or assets. Within `scheduler-hosted`, `npm run
build` creates the standalone Worker and `npm test` checks authorization,
reset behavior, persistence queries, and input validation with SQLite.
`.openai/hosting.json` identifies the existing Sites project: reuse it for
updates. `drizzle/` contains the schema-only database migration. Do not edit an
already published migration; append new ones.

Sites runtime configuration is managed outside Git:

- `PUBLIC_ORIGIN`: the exact public scheduler origin, used for write-origin checks.
- `OWNER_EMAIL`: the verified organizer account, stored as a secret.
- `INITIAL_OWNER_SLOTS`: initial owner availability, stored as a secret and
  applied only when the database is first initialized. Later resets never
  restore old seed values.

After syncing the UI, build and deploy the scheduler through Sites separately
from the normal GitHub Pages push. Only source files belong in Git; live data,
account sessions, and runtime secrets stay in the hosted service. The optional
WebMCP tools read availability and edit the current participant’s hour through
the same protected API; a supported WebMCP browser was not available for their
contract verification during the initial publication.

### Local scheduling prototype

The original `/meeting-scheduler/` Hugo page remains `draft: true` so GitHub
Pages does not publish a page without its required API. To use the local
prototype, build with Hugo 0.126.3 and start its loopback-only server:

```sh
hugo --buildDrafts --environment development --destination /tmp/astrojames-scheduler-protected-preview
node scripts/scheduler-preview-server.mjs /tmp/astrojames-scheduler-protected-preview .local/meeting-scheduler 1313
```

The server saves its private access link and state under the gitignored
`.local/meeting-scheduler/` directory, outside the served files. This prototype
is separate from the live database. Run `node --test test/meeting-scheduler.test.mjs
test/scheduler-server.test.mjs` to check the local model/API.

### Publishing the site

Commits pushed to `main` trigger the GitHub Pages workflow configured in this repo (see `.github/workflows/`). No manual `hugo` builds are required; Follow the [Hugo Blox Builder](https://hugoblox.com/) instructions to set this up.

## Unlisted seed journey explainer

`static/outreach/seed-journey/` hosts the research export at
`/outreach/seed-journey/`. Keep it out of navigation, content listings, the
sitemap, and Pagefind; retain its `noindex` meta tag and body exclusion.

The website presentation layer is `static/outreach/seed-journey-theme.css`,
loaded after the exported CSS. It uses the site's dark slate-blue palette and
shared Inter font. `js/theme.js` supplies those CSS colors to the canvas charts
in `main.js`, `cascade.js`, and `stretch3d.js`. When refreshing the research
export, preserve this stylesheet link, palette module/imports, and the chart
color substitutions. Keep the scientific text, formulas, and simulation logic
from the export unchanged.
The live landscape in `js/landscape.js` has a drawing-only dark palette (`P`)
matching the same website colors; preserve it during export refreshes too.

## SNR scientific explorer

The Movies page loads the SNR 26 explorer only after a visitor selects **Explore
SNR 26 in 3D**. Its fixed baroclinic isosurface, scalar values and sparse vectors
are in `static/models/snr26/`, `snr16/`, `snr57/`, and `snr60/`. The source volumes remain outside this repository.
The export manifest records the source SHA256, axis convention, normalization,
color limits, extraction settings, and numerical validation.

Regenerate with Python, NumPy, SciPy, h5py and scikit-image:

```sh
python scripts/export_snr_explorer.py /path/to/clustering_cache_00030_cluster_26.h5 static/models/snr26
python -m unittest discover -s test -p 'test_snr_export.py'
```

Input axes and vector components are **x, y, z**. Marching-cubes coordinates must
be sampled in that same order. The exporter checks this against the saved curl
of velocity and an asymmetric synthetic field. Do not reuse the old
`marching_cubes.py` field samples, which reversed x and z during interpolation.
The old shape-only viewer and its unused GLB assets have been removed. Temperature is presented as a normalized P/rho proxy, and no
physical-unit conversion is assumed.

`layouts/shortcodes/snr_explorer.html`, `assets/js/snr-explorer.js`, and
`assets/css/snr-explorer.css` provide the controls and rendering. Three.js 0.180.0
is vendored under `static/vendor/three-0.180.0/` with its MIT license. Only the
OrbitControls import path is changed to the adjacent local module. Unlit surface
colors preserve the legend mapping at full opacity; transparency blends colors.
Rendering occurs on interaction rather than in a continuous animation loop.
The surface remains fixed across fields, arrows retain full 3D directions, and
clipping affects both surface and arrows. Arrow density uses prefixes of a
farthest-point sample. Velocity remains in the simulation frame.

SNR26's stored baroclinic components have the **opposite sign** to
`grad(rho) cross grad(P) / rho²`. The exporter independently checks this against
finite differences, applies the validated sign to vectors before interpolation,
and records `baroclinic_convention.stored_to_physical_sign` (−1 for this cutout).
Both signed scalar views use the corrected physical source. Magnitudes and shell
geometry are unaffected. Source HDF5 files are never modified.

The remnant selector includes clusters 26 and 16 at output 00030, and 57 and 60
at output 00040. These IDs are snapshot-specific, not temporal tracks. Each
surface downloads on demand, and switching disposes the previous graphics
resources and event listeners. Missing source center metadata is recorded as null.

The probability-density panel follows the selected color field or vector
magnitude. Each manifest includes 80-bin full-range histograms for the whole
shell (area-lumped vertex quadrature) and the cluster mask (equal-volume cells).
Each triangle contributes one third of its area to each vertex. This approximates
surface-area weighting without bias toward densely triangulated regions.
Densities integrate to one over finite samples; undefined samples have their
excluded weight fraction reported. Log quantities are densities per unit log10.
Vector-magnitude PDFs use the norm of the interpolated vector, normalized by its
interior RMS. Scalar magnitude fields instead interpolate the saved magnitude,
as the surface colors do. Camera, cutaway, arrow sampling and opacity do not
filter distributions. CSV download retains edges, density, scope and normalization.


### Full-volume surfaces

The original fixed shell remains the initial preset. “Explore the full volume”
loads selected full-resolution field groups and extracts an independent contour
of density, pressure, P/rho, vorticity magnitude, or baroclinic magnitude.
The normalized numeric level and logarithmic slider describe the shape field.
The 95th percentile is the initial level for each field and smoothing choice.
All 128³ cells span the original cutout, including material outside cluster_mask.
Surface smoothing (none or sigma0.8voxels) affects geometry only. Fast64³ geometry
samples the same full extent; colors/vectors still sample native128³ fields.

`scripts/export_snr_volumes.py SOURCE.h5 static/models/snr26` exports lossless
byte-shuffled float32 gzip groups, approximately109–113MB per remnant in total.
Each group is13–21MB and downloads only when required. Group bytes and SHA256
are checked in the worker. P/rho and vector magnitudes are reconstructed on the
native grid; the physical baroclinic sign is inherited from the verified export.

`static/js/snr/volume-core.js` supplies trilinear interpolation, separable Gaussian
smoothing, classical marching cubes, surface-area histograms and arrow anchors.
The case table is from scikit-image0.25.2, with its license alongside it. Ambiguous
cube topology can differ from the Lewiner extraction used by the original preset.
The worker caches volumes, the smoothed shape field and the latest mesh. It caps
meshes at1.2million triangles and preserves the previous view on an empty contour
or failed request. Returning to the preset restores its original arrays and PDFs.
Remnant switching terminates the old worker and disposes graphics resources.

Surface PDFs use the displayed geometry and full vertex samples, independently
of arrow count, opacity, slice and cutaway. Interior PDFs retain the original
cluster-mask reference. Near-constant scalar ranges are padded to avoid magnifying
floating-point interpolation noise into false color contrast. Optional128²
orthogonal slices share the color scale and show the current shape-field contour
with piecewise-linear triangle intersections. Enabling/moving a slice positions a
matching cutaway; it does not change which surface enters the PDF.

Checks: `node test/test_snr_volume.mjs` and
`python -m unittest discover -s test -p 'test_snr*.py'`.
Independent source checks also compared128³ contour levels, signed colors and
velocity arrows against SciPy interpolation of the HDF5 data. Keep the complete
built site below the GitHub Pages1GB limit before adding more volume datasets.
