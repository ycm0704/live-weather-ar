const runtime = new URL("./vendor/mediapipe/", import.meta.url);

export async function createTracker(delegate) {
  const { FaceLandmarker, FilesetResolver } = await import(new URL("vision_bundle.mjs", runtime).href);
  const files = await FilesetResolver.forVisionTasks(new URL("wasm", runtime).href);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: new URL("face_landmarker.task", runtime).href,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
}
