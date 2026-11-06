import path from 'node:path';
import { realpath, lstat, readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function projectRoot(root) {
  const requested = path.resolve(root);
  try {
    const resolved = await realpath(requested);
    if (!(await lstat(resolved)).isDirectory()) throw new Error(`Project path is not a folder: ${requested}. Choose an existing project folder.`);
    return resolved;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new Error(`Project folder does not exist: ${requested}. Use --root . for your current folder, or supply the full path to an existing project. REGRA initializes an existing folder; it does not create the project itself.`);
    if (error.code === 'EACCES' || error.code === 'EPERM') throw new Error(`Cannot access project folder: ${requested}. Choose a folder you have permission to read.`);
    throw error;
  }
}
export async function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Use a path relative to the project root.');
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Path must stay inside the selected project.');
  let current = root;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlinks and junctions are not supported for REGRA-managed paths.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
export async function readText(file, { optional = false, maxBytes = 1000000 } = {}) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular file.');
    if (stat.size > maxBytes) throw new Error(`File exceeds the ${maxBytes}-byte limit.`);
    return (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
  } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
export async function atomicWrite(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temp, text, { flag: 'wx' }); await rename(temp, file); }
  finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
