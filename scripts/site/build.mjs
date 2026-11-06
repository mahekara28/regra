import { copyFile, mkdir, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const buildDirectory = path.join(root, '_site');
export const publicFiles = Object.freeze([
  'index.html', '404.html', 'styles.css', 'main.mjs', 'demo.mjs',
  'assets/regra.svg', 'assets/workbench.jpg', 'assets/social-card.png',
  'robots.txt', 'sitemap.xml'
]);

export async function buildSite() {
  // Only this generated directory inside the checkout may be replaced.
  if (path.dirname(buildDirectory) !== path.resolve(root) || path.basename(buildDirectory) !== '_site') throw new Error('Invalid website output directory.');
  const existing = await lstat(buildDirectory).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing?.isSymbolicLink()) throw new Error('Refusing to replace a linked website output directory.');
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(path.join(buildDirectory, 'assets'), { recursive: true });
  for (const file of publicFiles) await copyFile(path.join(root, 'site', file), path.join(buildDirectory, file));
  return buildDirectory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Static website built: ${await buildSite()} (${publicFiles.length} public assets)`);
}
