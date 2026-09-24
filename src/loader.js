// Runs the build in labelled stages, yielding to the browser between each one
// so the loading bar actually paints instead of freezing on a white page.
export async function runStages(stages, onProgress) {
  const total = stages.reduce((n, s) => n + (s.weight ?? 1), 0);
  let done = 0;
  for (const stage of stages) {
    onProgress(done / total, stage.label);
    await nextFrame();
    await stage.run();
    done += stage.weight ?? 1;
  }
  onProgress(1, 'ready');
  await nextFrame();
}

// Two frames: one to flush the style change, one to let it composite.
export function nextFrame() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
