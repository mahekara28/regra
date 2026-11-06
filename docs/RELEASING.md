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
