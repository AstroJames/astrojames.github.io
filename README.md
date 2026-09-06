# astrojames.github.io

Personal website for James Beattie built with [Hugo Blox Builder](https://hugoblox.com/) on top of Hugo. The repo hosts profile material (news, projects, publications, talks) plus richer assets such as movies and 3D point-cloud viewers.

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

Recent News shows the three newest posts directly below the biography, with an
archive link and no automatic rotation. Add news as a `content/post/` page bundle
with a title, date, summary, and body. Use `news_date` for a month-only date label
when an exact date is not known.

## Deployment

Commits pushed to `main` trigger the GitHub Pages workflow configured in this repo (see `.github/workflows/`). No manual `hugo` builds are required; Follow the [Hugo Blox Builder](https://hugoblox.com/) instructions to set this up.
