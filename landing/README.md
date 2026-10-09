# WebSpend landing page

The public page that explains what WebSpend does and links to the web app.

It is fully static: one HTML file, one stylesheet, the logo, a favicon and an Open Graph image.
There is no build step and no dependency beyond Geist and Geist Mono loaded from Google Fonts.
The only JavaScript is the optional light/dark toggle; without it the page follows the system theme.

## Files

| File           | What it is                                                        |
| -------------- | ----------------------------------------------------------------- |
| `index.html`   | The page                                                          |
| `styles.css`   | Styles, using the tokens from `../shared/DESIGN.md`               |
| `logo.svg`     | Copy of `../shared/brand/logo.svg`, used in the header and footer |
| `favicon.svg`  | Same logo, referenced as the favicon                              |
| `og-image.png` | 1200x630 image for link previews (Open Graph / Twitter card)      |

## Deploy

Copy the folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, an S3 bucket, nginx).
Nothing needs to run on the server.

To preview locally:

```bash
cd landing
python3 -m http.server 8080
# then open http://localhost:8080
```

## Changing the app URL

The "Open the app" buttons point at `https://app.webspend.local` by default. Every link to the app
carries a `data-app-url` attribute, so they are easy to find. There are two: one in the header and one
in the hero. Change both `href` values, or do it in one go:

```bash
sed -i '' 's#https://app.webspend.local#https://app.example.com#g' index.html
```

The Open Graph tags (`og:url`, `og:image`) use `https://webspend.local/` as the site URL. Replace that
with the real domain when the page goes live.

## Brand assets

The source files live in `../shared/brand/`:

- `logo.svg` — rounded square in `#5B4BFF` with the white W mark
- `logo-mark.svg` — the W alone, transparent, drawn in `currentColor` so it can be tinted
- `wordmark.svg` — logo tile plus "WebSpend" in Geist 600
- `icon-1024.png` — the logo rasterised at 1024x1024 for app icons and store listings

Regenerate the PNG with `rsvg-convert -w 1024 -h 1024 logo.svg -o icon-1024.png`.
