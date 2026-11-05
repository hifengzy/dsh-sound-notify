# Publishing & community listing

This repository is the source of truth. The GitHub Release, the npm package and
the awesome-dsh-plugin catalog entry are generated from it; the npm publish step
runs when the `NPM_TOKEN` repository secret is present (configured since
2026-11-05).

## Release (already configured)

Pushing a `v*` tag runs `.github/workflows/release.yml`:

1. runs tests and the packaging self-check;
2. checks the tag matches `package.json`'s version;
3. creates/updates the GitHub Release and attaches a **version-free**
   `dsh-sound-notify.tgz` asset (used by `latest/download/...` links and the
   catalog `tarball:` field);
4. publishes to npm with provenance when the `NPM_TOKEN` repository secret
   exists (it does).

The release asset for `v0.1.0`:
<https://github.com/hifengzy/dsh-sound-notify/releases/latest/download/dsh-sound-notify.tgz>

## npm — published

`dsh-sound-notify@0.1.1` was published on 2026-11-05 with a SLSA provenance
attestation: <https://www.npmjs.com/package/dsh-sound-notify>. Later `v*` tags
publish the matching version automatically, with no manual step.

The `NPM_TOKEN` secret holds a **granular access token** with `Read and write` on
**All packages** and **Bypass two-factor authentication** enabled. Those three
settings are mandatory for CI:

- classic tokens were permanently revoked in December 2025;
- publishing requires 2FA or a bypass-2FA token, and new TOTP
  (authenticator-app) 2FA setups are disabled — accounts use WebAuthn/passkeys;
- **All packages** (not a per-package scope) is required to create a brand-new
  package name;
- without the bypass checkbox, `npm publish` fails in CI with `EOTP`.

The token expires after 90 days. To replace it: npmjs.com → Access Tokens →
Generate New Token → Granular Access Token (same three settings), then
`gh secret set NPM_TOKEN -R hifengzy/dsh-sound-notify`.

### Migrating to Trusted Publishing (OIDC)

npm is targeting **January 2027** to stop direct publishing through 2FA-bypass
tokens. Before then, configure a trusted publisher for the package (npmjs.com →
the package → Settings → Trusted publishing: repository
`hifengzy/dsh-sound-notify`, workflow `release.yml`) and drop the `NPM_TOKEN`
step from the workflow. Trusted publishing cannot be configured for a package
that does not exist yet, which is why the first publish needed a token.
`npm stage publish` with a stage-only token is the alternative when interactive
2FA is unavailable.

A local publish also works once a browser session has passed interactive 2FA:

```bash
npm publish --access public
```

## awesome-dsh-plugin catalog — submitted and merged

The DSH plugin market (`dshmarket`) reads
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).
The entry was merged in PR
[#8535](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8535)
(category `notify`) and is live in the public feed:
<https://awesome-dsh-plugin.com/p/hifengzy/dsh-sound-notify/>.

The source entry and the (already used) submission helper remain in the repo:
`community/awesome-dsh-plugin.yml` and `scripts/submit-to-catalog.sh`. The
helper checks the catalog's 24-hour repository-age rule before opening a PR, so
it can be reused after a rename or for a monorepo subpackage.

Checklist enforced by the catalog CI:

- `package.json` declares `dsh.bundle` (this repository does);
- repository is at least 1 day old;
- repository is public, not archived, has real code;
- GitHub topic `dsh-plugin` is present;
- the one-line description is accurate.

## Native DSH 0.2.1 “Discover”

The native Discover feed is served from the `dsh-plugin-catalog` npm package
(`https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`, mirrored at
`https://awesome-dsh-plugin.com/index.json`) and only lists entries that have a
published npm version. The catalog index is rebuilt daily around 04:2x UTC, so
the publish lands in the next build; the catalog entry itself was already merged
in PR #8535. Users can install from npm, from GitHub, or from the release
tarball — all three are verified with DSH 0.2.1-rc.2.
