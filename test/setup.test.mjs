import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureProject, parseArgs, setup, copyPonytailSkill } from '../setup.mjs';

const fixture = () => mkdtempSync(join(tmpdir(), 'agent-setup-test-'));
test('preserves existing instructions and JSONC config across reruns', () => {
  const root = fixture();
  const original = '# Team rules\r\nKeep our existing conventions.\r\n';
  const config = '{ // aliases must survive\n "compilerOptions": {"paths":{"@/*":["src/*"]}}\n}\n';
  writeFileSync(join(root, 'CLAUDE.md'), original);
  writeFileSync(join(root, 'jsconfig.json'), config);
  configureProject(root, 'javascript');
  const once = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(once.startsWith(original));
  assert.deepEqual(configureProject(root, 'javascript'), []);
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), once);
  assert.equal(readFileSync(join(root, 'jsconfig.json'), 'utf8'), config);
  assert.ok(existsSync(join(root, '.agent-setup-backups')));
});
test('JavaScript configuration opts into type checking gradually', () => {
  const root = fixture();
  configureProject(root, 'javascript');
  const config = JSON.parse(readFileSync(join(root, 'jsconfig.json'), 'utf8'));
  assert.equal(config.compilerOptions.checkJs, false);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.ok(!readFileSync(join(root, 'CLAUDE.md'), 'utf8').includes('or npx tsc --noEmit'));
});
test('malformed markers leave files intact', () => {
  const root = fixture();
  const text = '<!-- codebase-agent-setup:start -->\nExisting text';
  writeFileSync(join(root, 'CLAUDE.md'), text);
  assert.throws(() => configureProject(root, 'typescript'), /Incomplete/);
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), text);
  assert.equal(existsSync(join(root, '.gitignore')), false);
});
test('external command failure stops before later installs and file changes', () => {
  const root = fixture(), calls = [];
  const execute = (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('--show-toplevel')) return root;
    if (command === 'npm' && args[0] === 'install') throw new Error('permission denied');
    return 'ok';
  };
  assert.throws(() => setup({project:root,language:'typescript'}, execute, () => {}), /permission denied/);
  assert.ok(!calls.some(x => x.includes('marketplace')));
  assert.equal(existsSync(join(root, 'CLAUDE.md')), false);
});
test('dry run performs checks without installations or file writes', () => {
  const root = fixture(), calls = [];
  setup({project:root,language:'typescript',dryRun:true}, (command,args) => {
    calls.push([command,...args]);
    return args.includes('--show-toplevel') ? root : 'ok';
  }, () => {});
  assert.ok(!calls.some(x => x[0] === 'npm' && x[1] === 'install'));
  assert.equal(existsSync(join(root, 'CLAUDE.md')), false);
});
test('completed setup checks graph output and reports real counts', () => {
  const root=fixture(), messages=[];
  setup({project:root,language:'typescript'}, (command,args) => {
    if (args.includes('--show-toplevel')) return root;
    if (command==='npm' && args[0]==='prefix') return root;
    if (command==='graft' && args[0]==='build') {
      mkdirSync(join(root,'graft','.graph'),{recursive:true});
      writeFileSync(join(root,'graft','.graph','wiring.json'),JSON.stringify({nodes:[{id:'file'}],edges:[]}));
    }
    return 'ok';
  }, text=>messages.push(text));
  assert.ok(messages.some(x=>x.includes('1 nodes, 0 edges')));
  assert.equal(existsSync(join(root,'jsconfig.json')),false);
});
test('argument validation rejects unknown languages and missing values', () => {
  assert.throws(()=>parseArgs(['--language','python']),/typescript or javascript/);
  assert.throws(()=>parseArgs(['--project']),/Missing value/);
  assert.throws(()=>parseArgs(['--surprise']),/Unknown argument/);
});
test('pins the generated Graft MCP server while preserving other servers', () => {
  const root=fixture();
  const other={command:'node',args:['our-server.mjs']};
  writeFileSync(join(root,'.mcp.json'),JSON.stringify({mcpServers:{graft:{command:'npx',args:['-y','@nanonets/graft','mcp']},other}}));
  configureProject(root,'typescript');
  const configured=JSON.parse(readFileSync(join(root,'.mcp.json'),'utf8'));
  assert.deepEqual(configured.mcpServers.other,other);
  assert.deepEqual(configured.mcpServers.graft.args,['-y','@nanonets/graft@0.28.0','mcp']);
  assert.deepEqual(configureProject(root,'typescript'),[]);
});

test('copies upstream Ponytail skill bytes and license without rewriting them', () => {
  const root=fixture();
  copyPonytailSkill(root);
  for(const name of ['SKILL.md','LICENSE']) {
    assert.deepEqual(readFileSync(join(root,'.claude','skills','ponytail',name)),readFileSync(new URL(`../vendor/ponytail/${name}`,import.meta.url)));
  }
  assert.deepEqual(copyPonytailSkill(root),[]);
});
test('backs up an existing Ponytail skill before installing the bundled copy', () => {
  const root=fixture();
  mkdirSync(join(root,'.claude','skills','ponytail'),{recursive:true});
  writeFileSync(join(root,'.claude','skills','ponytail','SKILL.md'),'Existing personal instructions');
  copyPonytailSkill(root);
  const saved=readdirSync(join(root,'.agent-setup-backups')).find(x=>x.startsWith('ponytail-SKILL.md'));
  assert.ok(saved);
  assert.equal(readFileSync(join(root,'.agent-setup-backups',saved),'utf8'),'Existing personal instructions');
});
