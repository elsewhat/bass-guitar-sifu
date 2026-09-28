# ADR-0001: Hosting and access control

Status: Superseded by ADR-0012
Date: 2026-09-28

## Context

The site is static. The owner wants it on GitHub Pages, with access limited to people who have access to the private repository, and no other login.

GitHub's documentation on Pages visibility:

- Pages from private repositories is available on GitHub Pro, Team, Enterprise Cloud and Enterprise Server.
- "GitHub Pages sites are publicly available on the internet, even if the repository for the site is private" (Creating a GitHub Pages site).
- Access-controlled ("private") Pages sites require an organization on GitHub Enterprise Cloud. A privately published site "can only be accessed by people with read access to the repository".

So a private repository on a personal account (Free or Pro) or a Team organization publishes a site that anyone with the URL can open. The repository contains Guitar Pro files from third parties and possibly lyrics references, which should not be public (ADR-0011).

Limits that apply in all cases: 1 GB published site, 1 GB recommended repository size, soft 100 GB/month bandwidth, 10-minute deploy timeout. The expected size (30 songs × ~100 KB `.gp` + generated JSON + a few WAV files) is far below these.

## Options

1. **GitHub Pages, private repository, personal account.** Site is public. Access control by obscurity of the URL only.
2. **GitHub Pages with private visibility on GitHub Enterprise Cloud.** Meets the requirement exactly. Requires an Enterprise Cloud organization (paid per user).
3. **Cloudflare Pages (or Workers static assets) deployed from the same private repository, protected by Cloudflare Access with GitHub as the login provider.** Cloudflare's Zero Trust free plan covers up to 50 users. Adds one login step through GitHub, and an allow-list of GitHub accounts or e-mail addresses is managed in Cloudflare.
4. **No hosting.** Run `npm run dev` or `npm run preview` locally. No access problem, no remote use.

## Decision

Pending. Recommended: option 3 if the site must be reachable from anywhere by a small group, option 2 if an Enterprise Cloud organization is already available.

The application is built so the choice does not affect the code:

- Vite `base` path comes from an environment variable (`/` for Cloudflare or a custom domain, `/<repo>/` for a GitHub project site).
- All data is fetched with relative URLs from `public/data/`.
- The deploy workflow is a separate job, so switching target means changing one workflow file.

## Consequences

- Until this is decided, the deploy job stays disabled and the site is built and tested in CI only.
- With option 3, the Spotify redirect URI (ADR-0008) and any YouTube embed restrictions use the Cloudflare hostname.
