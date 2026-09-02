import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { isWebGLAvailable } from './webgl-availability';

// jest-expo's RN test environment has no real DOM: 'document' is undefined by
// default, the same as the static web export's Node prerender pass. Each test
// below sets/restores global.document itself rather than relying on jsdom.
const originalDocument = global.document;

function stubDocument(getContext: (kind: string) => unknown) {
  global.document = { createElement: () => ({ getContext }) } as unknown as Document;
}

afterEach(() => {
  global.document = originalDocument;
});

describe('isWebGLAvailable', () => {
  it('returns false when there is no document (the static-export SSR/build pass)', () => {
    global.document = undefined as unknown as Document;
    expect(isWebGLAvailable()).toBe(false);
  });

  it('returns true when the canvas can get a webgl2 context', () => {
    const getContext = jest.fn((kind: string) => (kind === 'webgl2' ? {} : null));
    stubDocument(getContext);
    expect(isWebGLAvailable()).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });

  it('falls back through webgl and experimental-webgl before giving up', () => {
    const getContext = jest.fn((kind: string) => (kind === 'experimental-webgl' ? {} : null));
    stubDocument(getContext);
    expect(isWebGLAvailable()).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2');
    expect(getContext).toHaveBeenCalledWith('webgl');
    expect(getContext).toHaveBeenCalledWith('experimental-webgl');
  });

  it('returns false when no context kind is available', () => {
    stubDocument(() => null);
    expect(isWebGLAvailable()).toBe(false);
  });

  it('returns false if creating the canvas or getting a context throws', () => {
    global.document = {
      createElement: () => {
        throw new Error('boom');
      },
    } as unknown as Document;
    expect(isWebGLAvailable()).toBe(false);
  });
});
