# Connecting agents

The agent's MCP client starts REGRA over local stdio. No dashboard, hosted endpoint, API key or Ollama model is required. Each server is scoped to its configured project root.

```sh
regra init --root . --demo
regra connect --client cursor --root .
regra doctor --root .
```

Replace `cursor` with `claude`, `codex` or `vscode`. Multiple clients in one project share its evidence store. Omit `--demo` for an empty setup. From a clone, replace `regra` with `node src/cli.mjs` and use an absolute `--root` for another project.

`--root .` means the folder your terminal is currently in. To try REGRA in its own checkout, run `node src/cli.mjs init --root . --demo` there. For another project, use its actual existing folder path. Sample paths are not created automatically. If you see “Project folder does not exist,” correct the path before retrying. The dashboard's **Check folder** button validates it without creating or changing files; **Copy commands** also checks the folder first.

| Client | Project file | Entry |
| --- | --- | --- |
| Cursor | `.cursor/mcp.json` | `mcpServers.regra` |
| Claude Code | `.mcp.json` | `mcpServers.regra` |
| Codex | `.codex/config.toml` | `[mcp_servers.regra]` |
| VS Code | `.vscode/mcp.json` | `servers.regra` |

The command uses absolute Node/package/project paths and an argument array, handling Windows spaces without shell parsing. Existing unrelated settings and JSON comments are preserved. A conflicting REGRA entry is refused. Preview using `--dry-run`.

## Confirm a connection

1. `regra connections --root .` inspects installed configuration.
2. `regra doctor --root .` checks configuration/store/cases and performs real stdio discovery plus a status call.
3. Restart your agent in the project, allow its normal MCP prompt, and ask it to call `regra_status`.

The third step confirms that particular agent loaded REGRA. Doctor does not observe the editor. Codex project settings require a trusted project; other clients may also require workspace/server approval. Setup does not bypass any of those policies or edit global configuration.

Generated entries are machine-specific. Keep the installed package in place. If paths move, doctor marks the connection stale; disconnect and reconnect. Each teammate runs setup locally, or maintains reviewed portable configuration separately.

## Agent workflow

Call `regra_context` for the function, inspect the selected case file, and review its intended behavior. Preserve the original function. Call `regra_verify` with `caseFile`, `caseHash` from context, `before`, and `after`. Report the actual status and proof ID; use `regra_evidence` for the detailed result.

Inline replacement expectations are refused. A contract changed since retrieval is rejected until context and review are refreshed. A hash detects a change; it does not prove human review. An agent with other filesystem tools still has the access its host grants.

`regra_check` takes `caseFile` and `source` to replay behavior without creating a new lesson. Missing contracts and invalid paths cannot produce a passing result.

MCP makes these tools available; it does not require the agent to call them. For enforcement, run `regra check` as a required CI check for supported standalone source. Whole-repository execution remains planned.

## Disconnect

```sh
regra disconnect --client cursor --root .
```

Only the managed REGRA entry is removed. Evidence and other settings remain. Externally modified entries are preserved and reported. Codex removal also checks its marked block contains no unrelated tables.

After a setup crash, stop all REGRA setup commands before removing a stale `.regra/connections.lock`. The verification lock is `.regra/write.lock`. Never remove an active lock.

## Compatibility

Tests cover four configuration formats, preservation on connect/disconnect, real current-SDK calls, and a 2025-era MCP initialize exchange. These are not live interactive tests in all four editor products. Client versions and organization settings can affect loading.

MCP exposes no general shell, arbitrary file-reading, test-rewriting, or patch-application tool. Case paths reject traversal and symlinks. Functions still execute locally: Node permissions and VM contexts are not a security sandbox for hostile code. Use reviewed source until an OS/container runtime is added.

Official sources checked on 6 November 2026:

- [Codex MCP configuration](https://developers.openai.com/codex/mcp/)
- [Cursor MCP configuration](https://cursor.com/docs/mcp)
- [Claude Code MCP scopes](https://code.claude.com/docs/en/mcp)
- [VS Code MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [Official MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/server)

Codex instructions were checked using the OpenAI Docs skill and official OpenAI documentation.
