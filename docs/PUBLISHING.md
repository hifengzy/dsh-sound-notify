# Publishing & community listing

This repository is the source of truth. The GitHub Release and the
awesome-dsh-plugin catalog entry are generated from it; the npm publish step is
optional and gated on a repository secret.

## Release (already configured)

Pushing a `v*` tag runs `.github/workflows/release.yml`:

1. runs tests and the packaging self-check;
2. checks the tag matches `package.json`'s version;
3. creates/updates the GitHub Release and attaches a **version-free**
   `dsh-sound-notify.tgz` asset (used by `latest/download/...` links and the
   catalog `tarball:` field);
4. publishes to npm **only if** an `NPM_TOKEN` repository secret exists.

The release asset for `v0.1.0`:
<https://github.com/hifengzy/dsh-sound-notify/releases/latest/download/dsh-sound-notify.tgz>

## npm (requires a token)

npm publication is not automatic until a token is configured:

1. Create a granular npm token with **read/write** access to the
   `dsh-sound-notify` package (or an account token).
2. Add it to the repository: **Settings → Secrets and variables → Actions →
   New repository secret**, name `NPM_TOKEN`.
3. Re-run the failed/previous release workflow, or push a new tag. The
   `Publish to npm` step will publish with provenance.

Local alternative once authenticated (`npm login`):

```bash
npm publish --access public
```

The package name `dsh-sound-notify` was verified available on 2026-10-21.

## awesome-dsh-plugin catalog (24h repo-age rule)

The DSH plugin market (`dshmarket`) reads
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin),
which requires the submitted repository to be **at least 1 day old** (checked
by CI). The prepared entry is `community/awesome-dsh-plugin.yml`; the source
repository's topics already include the required `dsh-plugin`.

After the 24h window:

```bash
./scripts/submit-to-catalog.sh
```

The script checks the age, forks/clones the catalog, adds only
`data/plugins/hifengzy__dsh-sound-notify.yml`, pushes a branch, and opens the
PR. If it reports the repo is too young, wait and run it again.

Checklist enforced by the catalog CI:

- `package.json` declares `dsh.bundle` (this repository does);
- repository is at least 1 day old;
- repository is public, not archived, has real code;
- GitHub topic `dsh-plugin` is present;
- the one-line description is accurate.

## Native DSH 0.2.1 “Discover”

The native Discover feed (`https://awesome-dsh-plugin.com/index.json`) only
includes entries that have an npm package. Until an `NPM_TOKEN` is configured
and a release publishes to npm, users can install from GitHub or from the
release tarball — both are verified with DSH 0.2.1-rc.2.
