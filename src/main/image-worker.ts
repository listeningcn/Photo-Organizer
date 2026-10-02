import sharp from 'sharp';
import { parentPort } from 'node:worker_threads';

import { renderImages, type RenderInput } from './image-processing';

interface Request {
  id: number;
  input: RenderInput;
}

// Each worker handles one image at a time; parallelism comes from the pool.
sharp.concurrency(1);
sharp.cache(false);

parentPort?.on('message', async ({ id, input }: Request) => {
  try {
    const result = await renderImages(input);
    // sharp's output buffers are native-backed and can't be transferred; they're small,
    // so structured-clone copies are fine.
    parentPort?.postMessage({ id, result });
  } catch (error) {
    parentPort?.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
