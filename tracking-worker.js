let tracker;
let readFace;

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const [{ createTracker }, expressions] = await Promise.all([
        import("./tracker.mjs"), import("./expressions.mjs?v=27"),
      ]);
      readFace = expressions.readFace;
      tracker = await createTracker("CPU");
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: error.message });
    }
    return;
  }

  const { bitmap, at } = data;
  try {
    const start = performance.now();
    const face = readFace(tracker.detectForVideo(bitmap, at));
    self.postMessage({ type: "result", face, ms: performance.now() - start, at });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  } finally {
    bitmap.close();
  }
};
