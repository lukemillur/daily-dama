/**
 * Feature-detects WebGL availability so the landing hero can fall back to a
 * static image instead of rendering a blank/broken canvas.
 *
 * Two environments this must handle safely, neither of which has a real
 * `document`:
 * - The static web export's SSR/build-time prerender pass (Node, no DOM at
 *   all).
 * - A browser with WebGL disabled or unsupported.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}
