type GainSpyNode = {
  connect: () => unknown;
  disconnect: () => void;
  gain: {
    value: number;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
};

type FilterSpyNode = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  type: BiquadFilterType;
  Q: {
    setValueAtTime: ReturnType<typeof vi.fn>;
  };
  frequency: {
    value: number;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
};

type AnalyserSpyNode = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  getByteFrequencyData: ReturnType<typeof vi.fn>;
};

export const setupAudioContextMock = () => {
  const origAudioContext = window.AudioContext;
  const gains: GainSpyNode[] = [];
  const filters: FilterSpyNode[] = [];
  const analysers: AnalyserSpyNode[] = [];
  const fakeDestination = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as AudioDestinationNode;
  const fakeCtx = {
    currentTime: 0,
    resume: vi.fn(),
    close: vi.fn(),
    createMediaElementSource: () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createGain: () => {
      const node: GainSpyNode = {
        connect: () => fakeCtx,
        disconnect: vi.fn(),
        gain: {
          value: 1,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      };
      gains.push(node);
      return node as unknown as GainNode;
    },
    createBiquadFilter: () => {
      const node: FilterSpyNode = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        type: 'lowpass',
        Q: {
          setValueAtTime: vi.fn(),
        },
        frequency: {
          value: 22_000,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      };
      filters.push(node);
      return node as unknown as BiquadFilterNode;
    },
    createAnalyser: () => {
      const node: AnalyserSpyNode & {
        fftSize: number;
        frequencyBinCount: number;
        minDecibels: number;
        maxDecibels: number;
        smoothingTimeConstant: number;
      } = {
        fftSize: 512,
        frequencyBinCount: 256,
        minDecibels: -100,
        maxDecibels: -30,
        smoothingTimeConstant: 0.8,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getByteFrequencyData: vi.fn((values: Uint8Array) => {
          values.fill(172);
        }),
      };
      analysers.push(node);
      return node as unknown as AnalyserNode;
    },
    destination: fakeDestination,
  } as unknown as AudioContext;
  window.AudioContext = vi.fn(function () {
    return fakeCtx;
  }) as unknown as typeof AudioContext;
  const restore = () => {
    window.AudioContext = origAudioContext;
  };
  return { analysers, filters, gains, restore };
};

export const resetMediaSpies = (): {
  playMock: ReturnType<typeof vi.fn>;
  pauseMock: ReturnType<typeof vi.fn>;
} => {
  const playMock = window.HTMLMediaElement.prototype
    .play as unknown as ReturnType<typeof vi.fn>;
  const pauseMock = window.HTMLMediaElement.prototype
    .pause as unknown as ReturnType<typeof vi.fn>;
  playMock.mockClear();
  pauseMock.mockClear();
  return { playMock, pauseMock };
};

export const fireMediaCanPlay = (audio: HTMLAudioElement): void => {
  Object.defineProperty(audio, 'readyState', {
    value: 4,
    configurable: true,
  });
  audio.dispatchEvent(new Event('canplay', { bubbles: false }));
};

export async function flushMicrotasks() {
  for (let round = 0; round < 10; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export const fireMediaLoadStart = (audio: HTMLAudioElement): void => {
  Object.defineProperty(audio, 'readyState', {
    value: 0,
    configurable: true,
  });
  audio.dispatchEvent(new Event('loadstart', { bubbles: false }));
};
