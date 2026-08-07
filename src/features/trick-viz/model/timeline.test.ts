import { describe, expect, it, jest } from '@jest/globals';
import { Quaternion, Vector3 } from 'three';

import { toRigid, type BodyPose } from '@/features/trick-viz/model/body';
import {
  bakeSpan,
  buildTrick,
  concatTricks,
  findStallAt,
  sampleTrackInto,
  sampleView,
  type Beat,
  type Sample,
  type TrickState,
} from '@/features/trick-viz/model/timeline';

const still: BodyPose = { position: [0, 0, 0], rotation: [0, 0, 0] };

const start: TrickState = {
  held: 'ken',
  ken: still,
  tama: { position: [0, -1, 0], rotation: [0, 0, 0] },
  contact: { kind: 'hanging' },
};

/** A beat that slides the tama along +Y at a constant speed. */
function glide(seconds: number, speed: number, fromY: number): Beat {
  return (state) => {
    const at = (t: number) => ({
      ken: state.ken,
      tama: { position: [0, fromY + speed * t, 0] as const, rotation: [0, 0, 0] as const },
    });

    return {
      samples: bakeSpan(seconds, at),
      durationSeconds: seconds,
      out: {
        ...state,
        tama: { position: [0, fromY + speed * seconds, 0], rotation: [0, 0, 0] },
      },
    };
  };
}

/** The failure mode this whole layer is defensive about: an eased stop. */
function easeToStop(seconds: number, fromY: number, distance: number): Beat {
  return (state) => {
    const at = (t: number) => {
      const u = t / seconds;
      return {
        ken: state.ken,
        tama: {
          position: [0, fromY + distance * (1 - (1 - u) ** 2), 0] as const,
          rotation: [0, 0, 0] as const,
        },
      };
    };

    return {
      samples: bakeSpan(seconds, at),
      durationSeconds: seconds,
      out: { ...state, tama: { position: [0, fromY + distance, 0], rotation: [0, 0, 0] } },
    };
  };
}

describe('buildTrick', () => {
  it('lays beats end to end on one absolute-seconds clock', () => {
    const trick = buildTrick({
      id: 'x',
      name: 'X',
      start,
      beats: [glide(0.5, 2, -1), glide(0.25, 2, 0)],
    });

    expect(trick.durationSeconds).toBeCloseTo(0.75, 6);
    expect(trick.samples[0].t).toBe(0);
    expect(trick.samples[trick.samples.length - 1].t).toBeCloseTo(0.75, 6);
  });

  it('does not repeat the instant two beats share', () => {
    const trick = buildTrick({
      id: 'x',
      name: 'X',
      start,
      beats: [glide(0.5, 2, -1), glide(0.5, 2, 0)],
    });

    const times = trick.samples.map((sample) => sample.t);
    expect(new Set(times).size).toBe(times.length);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it('carries each beat’s end state into the next as the trick’s end', () => {
    const trick = buildTrick({
      id: 'x',
      name: 'X',
      start,
      beats: [glide(0.5, 2, -1), glide(0.5, 2, 0)],
    });

    expect(trick.end.tama.position[1]).toBeCloseTo(1, 6);
  });
});

describe('stall detection', () => {
  it('flags a seam where the motion stops and restarts', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    buildTrick({
      id: 'x',
      name: 'Stalling trick',
      start,
      beats: [easeToStop(0.5, -1, 3), glide(0.5, 6, 2)],
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('motion stops'));
    warn.mockRestore();
  });

  it('leaves a seam that carries its speed through alone', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    buildTrick({
      id: 'x',
      name: 'Smooth trick',
      start,
      beats: [glide(0.5, 6, -1), glide(0.5, 6, 2)],
    });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not flag a launch, which is legitimately an impulse', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Hanging almost still, then pulled hard: a big velocity jump, but no
    // stall. Flagging this would train everyone to ignore the warning.
    buildTrick({
      id: 'x',
      name: 'Pull',
      start,
      beats: [glide(0.5, 0.05, -1), glide(0.5, 8, -0.975)],
    });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('concatTricks', () => {
  function part(id: string, fromY: number, toY: number) {
    return buildTrick({
      id,
      name: id,
      start: { ...start, tama: { position: [0, fromY, 0], rotation: [0, 0, 0] } },
      beats: [glide(0.5, (toY - fromY) / 0.5, fromY)],
    });
  }

  it('plays parts as one continuous run', () => {
    const sequence = concatTricks('seq', 'Seq', [part('a', 0, 1), part('b', 1, 2)]);

    expect(sequence.durationSeconds).toBeCloseTo(1, 6);
    expect(sequence.end.tama.position[1]).toBeCloseTo(2, 6);
  });

  it('refuses a part that starts somewhere other than where the last one ended', () => {
    // The whole point of compound tricks is that the tama is already in the
    // cup when the next element begins. A part rebuilt from a fresh hang
    // would silently teleport it.
    expect(() => concatTricks('seq', 'Seq', [part('a', 0, 1), part('b', 0, 2)])).toThrow(
      /starts 1\.000 units from where/,
    );
  });
});

describe('sampleTrackInto', () => {
  const track: Sample[] = [
    { t: 0, ...bodies([0, 0, 0], [0, 0, 0]) },
    { t: 1, ...bodies([0, 2, 0], [0, Math.PI, 0]) },
  ];

  function bodies(position: [number, number, number], rotation: [number, number, number]) {
    const pose = toRigid({ position, rotation });
    return { ken: pose, tama: pose };
  }

  it('interpolates position linearly between samples', () => {
    const ken = { position: new Vector3(), quaternion: new Quaternion() };
    const tama = { position: new Vector3(), quaternion: new Quaternion() };

    sampleTrackInto(track, 0.5, ken, tama);
    expect(ken.position.y).toBeCloseTo(1, 6);
  });

  it('slerps rotation, so a half turn passes through a quarter turn', () => {
    const ken = { position: new Vector3(), quaternion: new Quaternion() };
    const tama = { position: new Vector3(), quaternion: new Quaternion() };

    sampleTrackInto(track, 0.5, ken, tama);

    const forward = new Vector3(0, 0, 1).applyQuaternion(ken.quaternion);
    expect(forward.x).toBeCloseTo(1, 5);
    expect(forward.z).toBeCloseTo(0, 5);
  });

  it('clamps outside the track rather than extrapolating', () => {
    const ken = { position: new Vector3(), quaternion: new Quaternion() };
    const tama = { position: new Vector3(), quaternion: new Quaternion() };

    sampleTrackInto(track, 99, ken, tama);
    expect(ken.position.y).toBeCloseTo(2, 6);
  });
});

describe('sampleView', () => {
  it('eases between the directions successive beats prefer', () => {
    const views = [
      { t: 0, direction: [1, 0, 0] as const },
      { t: 1, direction: [-1, 0, 0] as const },
    ];

    expect(sampleView(views, 0.5)[0]).toBeCloseTo(0, 6);
  });
});

describe('findStallAt', () => {
  it('reports nothing when there is not enough track around the seam', () => {
    expect(findStallAt([], 0)).toBeNull();
  });
});
