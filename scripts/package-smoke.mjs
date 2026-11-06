import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check using npm run test:package.');
const cacheArgs = process.env.npm_config_cache ? ['--cache', path.resolve(process.env.npm_config_cache)] : [];
const offline = process.env.REGRA_SMOKE_OFFLINE === '1';
const temp = await mkdtemp(path.join(tmpdir(), 'regra-package-'));
function command(args, cwd, timeout = 120000) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 4000000 });
  if (result.status !== 0) throw new Error(`Command failed: ${args.slice(0, 3).join(' ')}\n${result.error || ''}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
function npm(args, cwd = repository) { return command([npmCli, ...cacheArgs, '--no-audit', '--no-fund', ...args], cwd); }
try {
  const packed = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp]))[0];
  if (packed.files.some(f => /^(?:node_modules|\.regra|tests)\//.test(f.path))) throw new Error('Unexpected private/development files in npm tarball.');
  for (const file of ['src/index.mjs', 'src/index.d.ts', 'src/cli.mjs', 'src/mcp.mjs', 'src/runner.cjs', 'public/index.html']) if (!packed.files.some(f => f.path === file)) throw new Error(`Package is missing ${file}.`);
  const consumer = path.join(temp, 'consumer'); await mkdir(consumer);
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ name: 'regra-install-check', private: true, type: 'module' }));
  // A fresh consumer needs registry metadata, which npm ci's tarball cache may lack.
  // Reuse available cache entries but allow missing metadata/dependencies to download.
  npm(['install', path.join(temp, packed.filename), offline ? '--offline' : '--prefer-offline', '--ignore-scripts'], consumer);
  const cli = path.join(consumer, 'node_modules', '@mahekara28', 'regra', 'src', 'cli.mjs');
  const project = path.join(consumer, 'sample-project'); await mkdir(project);
  const version = npm(['exec', '--offline', '--', 'regra', '--version'], consumer);
  if (!version.includes(manifest.version)) throw new Error('Installed CLI version does not match the package.');
  command([cli, 'init', '--root', project, '--project', 'package-test', '--demo'], consumer);
  command([cli, 'connect', '--root', project, '--client', 'cursor'], consumer);
  const health = JSON.parse(command([cli, 'doctor', '--root', project, '--json'], consumer, 40000));
  if (!health.ready) throw new Error('Installed MCP protocol check failed.');
  const sample = `import {createRegra} from '@mahekara28/regra';\nconst r = createRegra({project:'package-test', directory:${JSON.stringify(path.join(project, '.regra'))}});\nconst spec={entry:'f',title:'Empty',repro:{name:'Empty',args:[[]],expect:0},checks:[{name:'One',args:[[5]],expect:5}]};\nconst run=await r.verify({spec,before:'function f(x){return x.reduce((a,b)=>a+b);}',after:'function f(x){return x.reduce((a,b)=>a+b,0);}'});\nif(run.status!=='verified') throw new Error(run.summary); console.log('Installed public library passed.');\n`;
  await writeFile(path.join(consumer, 'consumer.mjs'), sample);
  command([path.join(consumer, 'consumer.mjs')], consumer);
  await writeFile(path.join(consumer, 'consumer.mts'), `import {createRegra, type Spec} from '@mahekara28/regra';\nconst r=createRegra({project:'typed'});\nconst spec:Spec={project:'typed',entry:'f',title:'Empty',repro:{name:'Empty',args:[[]],expect:0},checks:[{name:'One',args:[[1]],expect:1}]};\nvoid r.verify({spec,before:'function f(){}',after:'function f(){}'});\n`);
  command([path.join(repository, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'consumer.mts'], consumer);
  console.log(JSON.stringify({ passed: true, version: manifest.version, package: packed.filename, bytes: packed.size, installation: offline ? 'offline, using a populated npm cache' : 'fresh consumer, fetching missing dependencies as needed', checks: ['clean tarball', 'fresh consumer install', 'npm CLI binary', 'public JS import', 'published TypeScript declarations', 'project setup', 'client config', 'real MCP discovery and status call'] }, null, 2));
} finally {
  // mkdtemp creates this owned scratch directory directly under the OS temp root.
  if (path.dirname(temp) !== path.resolve(tmpdir()) || !path.basename(temp).startsWith('regra-package-')) throw new Error('Refusing to remove an unexpected test directory.');
  await rm(temp, { recursive: true, force: true });
}
