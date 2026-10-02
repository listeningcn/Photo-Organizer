import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { type RenderedImages, renderImages, type RenderInput } from './image-processing';
import { logError } from './logger';

/** Rejection reason for tasks still running when the pool is destroyed. */
export const POOL_DESTROYED = Symbol('image pool destroyed');

interface Task {
  id: number;
  input: RenderInput;
  resolve: (result: RenderedImages) => void;
  reject: (reason: unknown) => void;
}

interface Slot {
  worker: Worker;
  task: Task | null;
}

type Reply = { id: number; result: RenderedImages } | { id: number; error: string };

const workerPath = () => join(__dirname, 'image-worker.js');

/**
 * Renders thumbnails and previews in worker threads so HEIC decoding and resizing never
 * block the main process. Falls back to rendering in-process if workers can't start.
 */
export class ImagePool {
  private readonly slots: Slot[] = [];
  private readonly queue: Task[] = [];
  private nextId = 0;
  private destroyed = false;
  private inline = false;

  constructor(size: number) {
    if (!existsSync(workerPath())) {
      this.inline = true;
      return;
    }
    for (let i = 0; i < size; i += 1) this.spawn();
  }

  run(input: RenderInput): Promise<RenderedImages> {
    if (this.destroyed) return Promise.reject(POOL_DESTROYED);
    if (this.inline) return renderImages(input);
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, input, resolve, reject });
      this.dispatch();
    });
  }

  /** Terminates all workers immediately; in-flight and queued tasks reject with POOL_DESTROYED. */
  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const task of this.queue.splice(0)) task.reject(POOL_DESTROYED);
    const workers = this.slots.splice(0).map((slot) => {
      slot.task?.reject(POOL_DESTROYED);
      return slot.worker;
    });
    await Promise.all(workers.map((worker) => worker.terminate()));
  }

  private spawn() {
    const slot: Slot = { worker: new Worker(workerPath()), task: null };
    slot.worker.on('message', (reply: Reply) => {
      const task = slot.task;
      if (!task || task.id !== reply.id) return;
      slot.task = null;
      if ('error' in reply) task.reject(new Error(reply.error));
      else task.resolve(reply.result);
      this.dispatch();
    });
    slot.worker.on('error', (error) => {
      logError('image worker crashed', error);
      this.replace(slot, error);
    });
    slot.worker.on('exit', (code) => {
      if (!this.destroyed && code !== 0) {
        this.replace(slot, new Error(`Image worker exited with code ${code}`));
      }
    });
    this.slots.push(slot);
  }

  /** A crashed worker fails only its own task; a fresh worker takes its place. */
  private replace(slot: Slot, error: unknown) {
    const index = this.slots.indexOf(slot);
    if (index < 0 || this.destroyed) return;
    this.slots.splice(index, 1);
    slot.task?.reject(error);
    slot.task = null;
    try {
      this.spawn();
    } catch (spawnError) {
      logError('image worker unavailable, rendering in-process', spawnError);
      if (this.slots.length === 0) {
        this.inline = true;
        for (const task of this.queue.splice(0)) {
          renderImages(task.input).then(task.resolve, task.reject);
        }
      }
    }
    this.dispatch();
  }

  private dispatch() {
    for (const slot of this.slots) {
      if (slot.task || this.queue.length === 0) continue;
      const task = this.queue.shift()!;
      slot.task = task;
      // Copy so the caller's buffer stays valid; the copy's memory moves to the worker.
      const buffer = new Uint8Array(task.input.buffer);
      slot.worker.postMessage({ id: task.id, input: { buffer, ext: task.input.ext } }, [
        buffer.buffer,
      ]);
    }
  }
}
