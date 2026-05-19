# traqr.ai Landing Page

This landing page is fully static and can be deployed without a build step.

## Files

- `index.html`: structure, SEO metadata, and copy
- `styles.css`: layout and visual styling
- `script.js`: mini graph interaction
- `assets/`: logo, favicon, social preview, and screenshot assets

## Deployment

Upload the full `landingpage-traqr` folder to your hosting and use its contents as the web root.

## Screenshot Map

Replace these files in `landingpage-traqr/assets/` with your real screenshots:

- `screenshot-dashboard.svg`
  Use this for the large left screenshot in the `Screens` section.
  Best screenshot: your main dashboard or weekly ranking overview.

- `screenshot-graph.svg`
  Use this for the top-right screenshot in the `Screens` section.
  Best screenshot: the real traqr.ai graph page with a centered selected node and visible connections.

- `screenshot-evidence.svg`
  Use this for the bottom-right screenshot in the `Screens` section.
  Best screenshot: a dossier, evidence timeline, or signal detail view.

## Recommended Screenshot Content

- Dashboard screenshot:
  Show weekly ranking, score, summary cards, and enough UI chrome to feel like the real product.

- Graph screenshot:
  Show the actual traqr.ai graph canvas with the side panel open if possible.

- Evidence screenshot:
  Show timeline entries, signal explanations, or a profile detail view with evidence.

## Notes

- The header logo uses `assets/logo.svg`.
- If you have a final domain, add `canonical` and `og:url` to `index.html`.
- Update `hello@traqr.ai` if you want a different CTA destination.
