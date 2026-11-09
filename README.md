# Codebase agent setup

One command sets up Graft, Ponytail, and the official TypeScript/JavaScript LSP plugin for **local Claude Code terminal sessions**. It asks whether your repository uses TypeScript or JavaScript. Both use the same language server.

## Run locally before publishing

Open your application repository root in a terminal, then run the supplied script by its absolute path:

```sh
node /absolute/path/to/codebase-agent-setup/setup.mjs
```

Replace the path with the downloaded script's location (quote paths containing spaces). Choose `1` for TypeScript or `2` for JavaScript. Restart Claude Code when the script finishes.

## Public one command setup

After publishing this directory at **m-adnan-mushtaq/codebase-agent-setup**, run this from your application's Git repository root:

```sh
npx --yes github:m-adnan-mushtaq/codebase-agent-setup
```

On Windows PowerShell, use `npx.cmd` if PowerShell blocks `npx.ps1`:

```powershell
npx.cmd --yes github:m-adnan-mushtaq/codebase-agent-setup
```

The GitHub command becomes usable after that public repository exists. This download runs the public repository's setup code. Review `setup.mjs` before use. For a fixed release, append `#v1.0.0` after creating that Git tag.

## Prerequisites

- Node.js 22.3 or newer with npm. Use a current LTS release.
- Git on PATH and an existing Git repository.
- An installed, signed-in Claude Code CLI supporting `claude plugin`.
- Network access to npm and GitHub and a writable npm global prefix.

The installer stops if a prerequisite or install command fails. It does not install Node, Git, or Claude Code and does not bypass their permission or trust dialogs. Do not use `sudo` automatically; fix your npm prefix permissions if a global installation is denied.

## What happens

1. Check prerequisites and require the Git repository root.
2. Ask TypeScript or JavaScript (or use `--language`).
3. Install pinned Graft 0.28.0, typescript-language-server 5.1.3, and TypeScript 5.9.3 globally. This can change existing global versions.
4. Register the official Claude marketplace and Ponytail marketplace, then install both plugins at project scope. Marketplace registration is stored in your user configuration; plugins are enabled in project settings. Marketplace plugin versions follow their upstream releases.
5. Run `graft init --agents claude --no-global --no-build`, followed by `graft build`. This uses the local structural pass, without `--deep` or an API key.
6. Pin Graft's generated MCP entry to 0.28.0 and add a marked navigation section to `CLAUDE.md`. Existing content is retained; changes made by this installer are backed up in `.agent-setup-backups/`. Graft and Claude manage their own integration files and settings merges.
7. Create a conservative `jsconfig.json` only for JavaScript projects with neither a JS nor TS config. Existing JSONC configs and aliases stay intact. New JS configs use `checkJs:false`; use `// @ts-check` in selected files or opt into `checkJs:true` after reviewing errors.
8. Print tool versions, installed plugins, and graph counts. Restart Claude Code, check `/plugin`, ask for a known function definition, and run `/ponytail`.

Graft skips common dependency/build directories, including `node_modules`, `dist`, `build`, and `coverage`. Git ignore rules exclude untracked generated output. Tracked generated files can still be indexed. Review your graph and project ignore rules; migrations remain available because they can be relevant to application changes.

TypeScript projects should already have the config and dependencies needed for their own type check. This installer does not add a tsconfig or change application dependencies. Run the project's existing check, or `npx tsc --noEmit`, and relevant tests.

The original Graft project now lives at [Trail-Code](https://github.com/trailhq/Trail-Code). This blog example pins the Graft package and command so it matches the recorded workflow. It does not opt into Trail's session look-back or cloud setup.

## Options

```sh
node setup.mjs --language typescript --project /absolute/path/to/repo
node setup.mjs --language javascript --dry-run
node setup.mjs --help
```

`--dry-run` checks installed prerequisites and prints the plan without writing configuration or installing packages. `--language` is required in a non-interactive shell. Setup is repeatable: managed instructions are replaced in place and existing JS/TS configs are preserved. Completed package/plugin installations remain if a later step fails; fix that step and rerun.

## Publish on GitHub

Create an empty public repository named `codebase-agent-setup` under `m-adnan-mushtaq`. Upload **only this directory's contents**, not the blog, recordings, work directory, or an application's generated graph.

With GitHub CLI installed and signed in, from this directory:

```sh
git init -b main
git add package.json setup.mjs README.md LICENSE .gitignore test
git commit -m "Add one command Claude Code navigation setup"
gh repo create m-adnan-mushtaq/codebase-agent-setup --public --source . --remote origin --push
```

Alternatively create the repository in GitHub's website and follow its existing-repository push instructions. Before linking it in the blog, try the public `npx` command in a disposable TS repository and a JS repository. Confirm `/plugin`, navigation and Ponytail in a restarted, authenticated Claude Code session.

## Validation

```sh
npm test
```

Eight tests cover preservation of existing instructions and JSONC, repeat runs, malformed markers, JavaScript defaults, dry runs, command failure handling, graph-count reporting, and MCP version pinning. They simulate package/plugin commands; they do not prove live Claude authentication or plugin activation. Separate Windows smoke checks ran real Graft init/build twice on both TypeScript and JavaScript fixtures, verified generated configuration, and checked the language-server executable. Claude plugin calls were simulated because the Claude CLI was unavailable in the validation environment.

## Sources

- [Official Claude Code plugin installation](https://code.claude.com/docs/en/discover-plugins)
- [Official code intelligence setup](https://code.claude.com/docs/en/plugins/code-intelligence)
- [Official TypeScript LSP plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/typescript-lsp)
- [Graft upstream](https://github.com/trailhq/Trail-Code)
- [Ponytail upstream](https://github.com/DietrichGebert/ponytail)
