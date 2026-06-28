# Releasing Graphein

Releases are **automated**. Pushing a `vX.Y.Z` git tag triggers
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which builds,
verifies, and publishes all four packages to npm and creates a GitHub Release.

## Packages published

All four are versioned **in lockstep** (same version every release) and published
publicly:

| npm package       | path             |
| ----------------- | ---------------- |
| `graphein`        | `packages/core`  |
| `@graphein/node`  | `packages/node`  |
| `@graphein/react` | `packages/react` |
| `graphein-mcp`    | `packages/mcp`   |

## One-time setup: npm Trusted Publishing (OIDC)

The workflow authenticates with **OIDC Trusted Publishing** — there is **no
`NPM_TOKEN` secret**. Instead, each package must trust this repo's workflow. This is a
one-time setup per package, done by the npm package owner on npmjs.com:

For **each** of `graphein`, `@graphein/node`, `@graphein/react`, `graphein-mcp`:

1. Go to the package page → **Settings**.
2. Under **Trusted Publisher**, choose **GitHub Actions**.
3. Fill in:
   - **Organization or user:** `spatney`
   - **Repository:** `graphein`
   - **Workflow filename:** `release.yml`
   - **Environment:** _(leave blank)_
4. Save.

Until this is configured, the publish step falls back to requiring a token and will
**fail**. (Trusted Publishing also requires the publish runner to use **npm ≥ 11.5.1**;
the workflow upgrades npm automatically.)

## Cutting a release

1. Bump the `version` field to the new `X.Y.Z` in **all** of:
   - `package.json` (root)
   - `packages/core/package.json`
   - `packages/node/package.json`
   - `packages/react/package.json`
   - `packages/mcp/package.json`

   Also bump the inter-package dependency ranges that pin `graphein` /
   `@graphein/node` (e.g. `"graphein": "^X.Y.Z"`) so consumers resolve the matching
   version.
2. Commit the bump (e.g. `chore: release vX.Y.Z`) and push to `master`.
3. Tag and push:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

4. Watch the **Release** workflow in the Actions tab. It will:
   - verify the tag matches every package version (fails fast on a mismatch),
   - run `typecheck`, `lint`, `build`, `test`,
   - publish each package **with provenance** (skipping any version already on npm),
   - create a GitHub Release with auto-generated notes.

## Safety behaviours

- **Version-match guard** — if the tag (`vX.Y.Z`) doesn't match the `version` in the
  root and all four package manifests, the run fails before publishing anything.
- **Idempotent publish** — a package whose `name@version` is already on npm is skipped,
  so re-running a tag or recovering from a partial publish is safe.
- **Provenance** — published with `--provenance`, producing a signed supply-chain
  attestation (requires the public repo + `id-token: write`, both already set).

## Troubleshooting

- **`npm publish` 403 / "You must be logged in"** — the Trusted Publisher isn't
  configured for that package, or the workflow filename / repo doesn't match the one
  registered on npmjs.com. Re-check the one-time setup above.
- **Version-guard failure** — a manifest still has the old version, or you tagged
  without bumping. Fix the version(s), delete and re-push the tag.
- **Provenance error about missing OIDC token** — ensure the job keeps
  `permissions: id-token: write` (set at the workflow level in `release.yml`).
- **Nothing published but the run is green** — every package version was already on
  npm (the idempotent skip). Bump versions and tag again.

## Local dry run

Before tagging, you can sanity-check a package's tarball without publishing:

```sh
npm run build
npm publish --workspace graphein --dry-run
```
