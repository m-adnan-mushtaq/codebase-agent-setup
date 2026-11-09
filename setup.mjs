#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

export const versions = { graft: '0.28.0', typescript: '5.9.3', server: '5.1.3' };
export function run(command, args, { cwd, capture = false, env = process.env } = {}) {
  // Windows .cmd launchers need cmd.exe. Accept only plain arguments here:
  // no shell metacharacters, expansions or paths containing spaces.
  // Application paths are supplied separately as cwd.
  const launcher = process.platform === 'win32' && ['npm', 'claude', 'graft', 'typescript-language-server'].includes(command);
  if (launcher && args.some(arg => !/^[a-zA-Z0-9_@./:=+\-]+$/.test(arg))) throw new Error('Unsupported Windows launcher argument');
  const executable = launcher ? 'cmd.exe' : command;
  const parameters = launcher ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
  const result = spawnSync(executable, parameters, {
    cwd, env, encoding: 'utf8', windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false,
  });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status}). ${result.error?.message || result.stderr || ''}`);
  return result.stdout?.trim() || '';
}
export function parseArgs(args) {
  const options = { project: process.cwd(), language: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--language' || arg === '--project') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = args[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.language && !['typescript', 'javascript'].includes(options.language)) throw new Error('--language must be typescript or javascript');
  return options;
}
export function instructions(language) {
  const check = language === 'typescript'
    ? 'Run the project type-check script, or npx tsc --noEmit, at the end.'
    : 'Run the project lint and test scripts at the end. For a configured JS type-check project, also run npx tsc -p jsconfig.json --noEmit; use // @ts-check in individual files when enabling checking gradually.';
  return `## Navigating this codebase\n\n- Query Graft for symbols, callers and impact before broad grep or whole-file reads.\n- Use the language server for exact definitions, references and types.\n- Read the line ranges needed to understand the change and its callers.\n- Fix new language-server diagnostics after each edit. ${check}\n- Apply the installed Ponytail skill: reuse existing code, standard libraries and installed packages before adding new code. Invoke /ponytail explicitly when needed.\n- Run the relevant tests before finishing.\n`;
}
export function configureProject(root, language) {
  const changed = [];
  const backup = join(root, '.agent-setup-backups');
  function save(relative, next) {
    const target = join(root, relative);
    const previous = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (previous === next) return;
    if (previous !== null) {
      mkdirSync(backup, { recursive: true });
      copyFileSync(target, join(backup, relative.replaceAll('/', '__') + '.' + Date.now() + '.bak'));
    }
    writeFileSync(target, next);
    changed.push(relative);
  }
  const target = join(root, 'CLAUDE.md');
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const start = '<!-- codebase-agent-setup:start -->', end = '<!-- codebase-agent-setup:end -->';
  const a = previous.indexOf(start), b = previous.indexOf(end);
  if ((a < 0) !== (b < 0) || (a >= 0 && b < a)) throw new Error('Incomplete setup markers in CLAUDE.md; repair them before rerunning.');
  const ignorePath = join(root, '.gitignore');
  const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  if (!ignore.split(/\r?\n/).includes('/.agent-setup-backups/')) save('.gitignore', ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + '\n# Local setup backups\n/.agent-setup-backups/\n');
  const block = `${start}\n${instructions(language)}${end}`;
  save('CLAUDE.md', a >= 0 ? previous.slice(0, a) + block + previous.slice(b + end.length) : previous + (previous && !previous.endsWith('\n') ? '\n' : '') + '\n' + block + '\n');
  // Preserve existing JSONC configs and aliases byte-for-byte. Enable JS checking
  // gradually so installation does not surface hundreds of unrelated errors.
  if (language === 'javascript' && !existsSync(join(root, 'jsconfig.json')) && !existsSync(join(root, 'tsconfig.json'))) {
    save('jsconfig.json', JSON.stringify({
      compilerOptions: { allowJs: true, checkJs: false, noEmit: true, maxNodeModuleJsDepth: 0 },
      exclude: ['node_modules', 'dist', 'build', 'coverage', 'graft', '.agent-setup-backups'],
    }, null, 2) + '\n');
  }
  const mcpPath = join(root, '.mcp.json');
  if (existsSync(mcpPath)) {
    const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
    if (mcp.mcpServers?.graft?.command === 'npx') {
      mcp.mcpServers.graft.args = ['-y', `@nanonets/graft@${versions.graft}`, 'mcp'];
      save('.mcp.json', JSON.stringify(mcp, null, 2) + '\n');
    }
  }
  return changed;
}
export function setup(options, execute = run, log = console.log) {
  const root = resolve(options.project);
  if (!existsSync(root)) throw new Error(`Project does not exist: ${root}`);
  if (!['typescript', 'javascript'].includes(options.language)) throw new Error('Choose typescript or javascript');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 3)) throw new Error('Install Node.js 22.3 or newer first (a current LTS release is recommended).');
  const invoke = (command, args, extra = {}) => execute(command, args, { cwd: root, ...extra });
  invoke('git', ['--version'], { capture: true });
  const gitRoot = invoke('git', ['rev-parse', '--show-toplevel'], { capture: true });
  if (resolve(gitRoot).toLowerCase() !== root.toLowerCase()) throw new Error(`Run at the Git repository root: ${gitRoot}`);
  invoke('npm', ['--version'], { capture: true });
  invoke('claude', ['--version'], { capture: true });
  invoke('claude', ['plugin', 'install', '--help'], { capture: true });
  log(`Project: ${root}\nLanguage: ${options.language}\nGraft ${versions.graft}, TypeScript ${versions.typescript}, language server ${versions.server}`);
  const plan = [
    ['npm', ['install', '-g', `@nanonets/graft@${versions.graft}`, `typescript-language-server@${versions.server}`, `typescript@${versions.typescript}`]],
    ['claude', ['plugin', 'marketplace', 'add', 'anthropics/claude-plugins-official']],
    ['claude', ['plugin', 'install', 'typescript-lsp@claude-plugins-official', '--scope', 'project']],
    ['claude', ['plugin', 'marketplace', 'add', 'DietrichGebert/ponytail']],
    ['claude', ['plugin', 'install', 'ponytail@ponytail', '--scope', 'project']],
    ['graft', ['init', '--agents', 'claude', '--no-global', '--no-build']],
    ['graft', ['build']],
  ];
  if (options.dryRun) {
    plan.forEach(([command, args]) => log(`> ${command} ${args.join(' ')}`));
    log('Would add a managed CLAUDE.md section, back up changed files, and create jsconfig.json for unconfigured JavaScript projects. No writes or installations performed.');
    return;
  }
  invoke(...plan[0]);
  const prefix = invoke('npm', ['prefix', '-g'], { capture: true });
  const bin = process.platform === 'win32' ? prefix : join(prefix, 'bin');
  const env = { ...process.env, PATH: bin + delimiter + (process.env.PATH || '') };
  const installed = (command, args, extra = {}) => invoke(command, args, { env, ...extra });
  for (const [command, args] of plan.slice(1)) { log(`\n> ${command} ${args.join(' ')}`); installed(command, args); }
  const changed = configureProject(root, options.language);
  installed('graft', ['--version']);
  installed('typescript-language-server', ['--version']);
  installed('claude', ['plugin', 'list']);
  const graphPath = join(root, 'graft', '.graph', 'wiring.json');
  if (!existsSync(graphPath)) throw new Error('Graft did not produce graft/.graph/wiring.json. Review the build output.');
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const count = x => Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : 0;
  log(`\nSetup complete. Graph: ${count(graph.nodes)} nodes, ${count(graph.edges)} edges.`);
  log(`Additional files changed: ${changed.join(', ') || 'none (already configured)'}. Graft and Claude also wrote project integration files; inspect git status --short.`);
  log('Restart Claude Code here. Verify both plugins in /plugin, ask for a symbol definition, then invoke /ponytail.');
  log('Graft skips standard dependency/build folders and respects Git visibility. Review tracked generated files. This installer did not edit application source files.');
  if (options.language === 'javascript') log('Existing JS/TS configs were preserved. A new jsconfig uses checkJs:false; add // @ts-check to selected files or enable checkJs after reviewing existing errors.');
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log('Usage: codebase-agent-setup [--language typescript|javascript] [--project path] [--dry-run]\nRun in your Git project root. Requires Node.js 22.3+, npm, Git, and an authenticated Claude Code CLI.'); return; }
  if (!options.language) {
    if (!process.stdin.isTTY) throw new Error('Pass --language typescript or --language javascript when stdin is not interactive.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      while (!options.language) {
        const answer = (await rl.question('Project language? [1] TypeScript [2] JavaScript: ')).trim().toLowerCase();
        if (['1', 'ts', 'typescript'].includes(answer)) options.language = 'typescript';
        else if (['2', 'js', 'javascript'].includes(answer)) options.language = 'javascript';
        else console.log('Enter 1 for TypeScript or 2 for JavaScript.');
      }
    } finally { rl.close(); }
  }
  setup(options);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`\nSetup stopped: ${error.message}\nCorrect the failed step and rerun. Completed npm/plugin installations may remain.`); process.exitCode = 1;
});
