# Release preparation

`@mahekara28/regra@0.2.0-beta.1` is prepared locally and has not been published.

## Validate and commit

```sh
npm ci
npm test
npm run typecheck
npm run test:package
git diff --check
git status
git add .
git commit -m "Add REGRA library, MCP tools and project connections"
git push
```

Review the diff first. Commit the lockfile. `node_modules/`, `.regra/`, tarballs and logs are ignored. Once these changes are pushed, GitHub installation works without an npm release:

```sh
npm install -g github:mahekara28/regra
```

The package uses source ESM; consumers need no build step.

## Pack and publish separately

```sh
npm pack --dry-run
npm pack
```

The allowlist includes runtime source, declarations, browser assets, selected examples and docs. It excludes evidence stores, tests, node_modules and the original local-model proof record. The smoke test installs an actual tarball into a clean consumer.

The package smoke test uses npm's configured cache and downloads missing registry metadata or dependencies when needed. This lets it run on a fresh CI runner. `npm ci` can cache dependency tarballs without all the registry metadata needed by a new consumer; forcing that install offline can fail with `ENOTCACHED`.

For a deliberate offline check with a previously populated cache, set `REGRA_SMOKE_OFFLINE=1`. In PowerShell:

```powershell
$env:REGRA_SMOKE_OFFLINE = '1'
npm run test:package
Remove-Item Env:REGRA_SMOKE_OFFLINE
```

Publishing requires an npm account with permission to the `@mahekara28` scope, following the naming of Context Relay. Confirm scope ownership and package contents before running:

```sh
npm login
npm whoami
npm publish --access public --tag beta
```

These publishing commands have not been executed. The beta tag keeps this release out of the default `latest` install path. Only after successful publication is this registry command available:

```sh
npm install -g @mahekara28/regra@beta
```

Do not put npm tokens in the repository or browser. Automated trusted publishing can be added later.
