import { mkdir, readFile, writeFile, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSpec, verify, lessonFrom } from './core.mjs';

export class Store {
  constructor(directory) { this.directory = path.resolve(directory); this.file = path.join(this.directory, 'state.json'); }
  async read() {
    try {
      const state = JSON.parse(await readFile(this.file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.lessons) || !Array.isArray(state.runs)) throw new Error('Unsupported state format.');
      state.lessons.forEach(validateSpec);
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, lessons: [], runs: [] };
      throw new Error(`Cannot read lesson history; refusing to replace it. ${error.message}`);
    }
  }
  async transaction(callback) {
    await mkdir(this.directory, { recursive: true });
    const lockPath = path.join(this.directory, 'write.lock');
    let lock;
    try { lock = await open(lockPath, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Another verification is running, or a previous run left a lock. Retry; see README for recovery.'); throw error; }
    let temp;
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      const state = await this.read();
      const result = await callback(state);
      temp = path.join(this.directory, `state-${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
      await rename(temp, this.file);
      return result;
    } finally {
      if (temp) await unlink(temp).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
  }
  async verify(request) {
    return this.transaction(async state => {
      const run = await verify({ ...request, lessons: state.lessons });
      if (run.status === 'verified') {
        const lesson = lessonFrom(run);
        const previous = state.lessons.find(l => l.id === lesson.id);
        if (!previous) state.lessons.push(lesson);
        else {
          // Retain new checks from a later verified run; never weaken old ones.
          for (const check of lesson.checks) {
            const identity = c => JSON.stringify({ args: c.args, expect: c.expect, throws: c.throws });
            if (!previous.checks.some(c => identity(c) === identity(check))) previous.checks.push(check);
          }
          // The validated per-lesson limit is deliberate: fail without writing if exceeded.
          validateSpec(previous);
        }
        run.lessonId = lesson.id;
      }
      state.runs.push(run);
      return run;
    });
  }
}
