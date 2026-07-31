import { FC, useEffect, useRef } from 'react';

const INTERACTIVE_SELECTOR =
  'button, a, input, [role="button"], [role="option"], [role="menuitem"], [tabindex]';

export const CreauxInterfaceLayer: FC = () => {
  const audioContext = useRef<AudioContext>();

  useEffect(() => {
    let animationFrame = 0;

    const updatePointer = (event: PointerEvent) => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const x = event.clientX / window.innerWidth - 0.5;
        const y = event.clientY / window.innerHeight - 0.5;
        document.documentElement.style.setProperty('--pointer-x', `${x}`);
        document.documentElement.style.setProperty('--pointer-y', `${y}`);
      });
    };

    const playTone = (frequency: number, duration: number, volume: number) => {
      const AudioContextClass =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      audioContext.current ??= new AudioContextClass();
      const context = audioContext.current;
      if (
        typeof context.createOscillator !== 'function' ||
        typeof context.createGain !== 'function'
      ) {
        return;
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 1.18,
        start + duration,
      );
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(INTERACTIVE_SELECTOR)) {
        playTone(740, 0.045, 0.018);
      }
    };

    const handleFocus = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (target?.matches(INTERACTIVE_SELECTOR)) {
        playTone(1020, 0.034, 0.01);
      }
    };

    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, {
      passive: true,
    });
    window.addEventListener('focusin', handleFocus);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('focusin', handleFocus);
      void audioContext.current?.close();
    };
  }, []);

  return (
    <div className="creaux-atmosphere" aria-hidden="true">
      <div className="creaux-aurora" />
      <div className="creaux-orbit creaux-orbit-one" />
      <div className="creaux-orbit creaux-orbit-two" />
      <div className="creaux-shard creaux-shard-one" />
      <div className="creaux-shard creaux-shard-two" />
      <div className="creaux-shard creaux-shard-three" />
      <div className="creaux-scanline" />
    </div>
  );
};
