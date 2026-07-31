import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { RemiliaBossGame } from './RemiliaBossGame';

import './remilia-boss.css';

const REMILIA_FUMO_URL = new URL('./assets/remilia-fumo.png', import.meta.url)
  .href;
const REMILIA_THEME_URL = new URL(
  './assets/remilia-boss-theme.mp3',
  import.meta.url,
).href;
const REMILIA_VICTORY_URL = new URL(
  './assets/remilia-victory.mp3',
  import.meta.url,
).href;

export const REMILIA_DIALOGUE_LINES = [
  'あの子のことなんて、ろくに知らないけれど……',
  '何度もつついているのを見ていたら、腹が立ってきたわ！',
] as const;

type SequencePhase =
  | 'breach'
  | 'reveal'
  | 'dialogue'
  | 'fight'
  | 'victory'
  | 'epilogue'
  | 'defeat';

type Point = {
  x: number;
  y: number;
};

type Bullet = Point & {
  vx: number;
  vy: number;
  radius: number;
  color: string;
  kind: 'orb' | 'petal';
};

type Shot = Point & {
  vy: number;
};

const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 540;
const BOSS_MAX_HP = 360;
const PLAYER_LIVES = 4;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const fadeAudio = (
  audio: HTMLAudioElement,
  target: number,
  durationMs: number,
) => {
  const startedAt = performance.now();
  const initial = audio.volume;
  let frame = 0;
  const step = (now: number) => {
    const progress = clamp((now - startedAt) / durationMs, 0, 1);
    const eased = 1 - (1 - progress) ** 3;
    audio.volume = initial + (target - initial) * eased;
    if (progress < 1) {
      frame = requestAnimationFrame(step);
    }
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
};

const createFxContext = () => {
  const AudioContextClass =
    window.AudioContext ??
    (
      window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
};

const playBreachFx = () => {
  const context = createFxContext();
  if (!context) {
    return () => undefined;
  }
  void context.resume();
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.32, context.currentTime + 0.18);
  master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2.35);
  master.connect(context.destination);

  const rumble = context.createOscillator();
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(37, context.currentTime);
  rumble.frequency.exponentialRampToValueAtTime(24, context.currentTime + 2.2);
  const rumbleFilter = context.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 92;
  rumble.connect(rumbleFilter).connect(master);
  rumble.start();
  rumble.stop(context.currentTime + 2.4);

  const drop = context.createOscillator();
  const dropGain = context.createGain();
  drop.type = 'sine';
  drop.frequency.setValueAtTime(86, context.currentTime + 0.72);
  drop.frequency.exponentialRampToValueAtTime(25, context.currentTime + 1.62);
  dropGain.gain.setValueAtTime(0.0001, context.currentTime);
  dropGain.gain.setValueAtTime(0.0001, context.currentTime + 0.7);
  dropGain.gain.exponentialRampToValueAtTime(0.72, context.currentTime + 0.76);
  dropGain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + 1.75,
  );
  drop.connect(dropGain).connect(context.destination);
  drop.start(context.currentTime + 0.7);
  drop.stop(context.currentTime + 1.8);

  return () => {
    if (context.state !== 'closed') {
      void context.close();
    }
  };
};

const playImpactFx = () => {
  const context = createFxContext();
  if (!context) {
    return;
  }
  void context.resume();
  const length = Math.floor(context.sampleRate * 0.34);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const decay = 1 - index / length;
    data[index] =
      (Math.random() * 2 - 1) * decay ** 3 +
      (index % 91 < 5 ? 0.45 * decay : 0);
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = 880;
  filter.Q.value = 0.65;
  gain.gain.setValueAtTime(0.5, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.36);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  source.onended = () => void context.close();
};

const playDefeatFx = () => {
  const context = createFxContext();
  if (!context) {
    return () => undefined;
  }
  void context.resume();
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const tremolo = context.createOscillator();
  const tremoloGain = context.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(46, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    19,
    context.currentTime + 4.2,
  );
  tremolo.frequency.value = 7;
  tremoloGain.gain.value = 0.12;
  tremolo.connect(tremoloGain).connect(gain.gain);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.38, context.currentTime + 1.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 4.25);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  tremolo.start();
  oscillator.stop(context.currentTime + 4.3);
  tremolo.stop(context.currentTime + 4.3);
  return () => {
    if (context.state !== 'closed') {
      void context.close();
    }
  };
};

export const LegacyRemiliaBossGame: FC<{
  onVictory: () => void;
  onDefeat: () => void;
}> = ({ onVictory, onDefeat }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bossHp, setBossHp] = useState(BOSS_MAX_HP);
  const [lives, setLives] = useState(PLAYER_LIVES);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const image = new Image();
    image.src = REMILIA_FUMO_URL;
    const keys = new Set<string>();
    const pointer = { down: false, x: ARENA_WIDTH / 2, y: 470 };
    const player = {
      x: ARENA_WIDTH / 2,
      y: 470,
      invulnerableUntil: 0,
      lives: PLAYER_LIVES,
    };
    const boss = { x: ARENA_WIDTH / 2, y: 112, hp: BOSS_MAX_HP };
    const bullets: Bullet[] = [];
    const shots: Shot[] = [];
    let startedAt = performance.now();
    let previous = startedAt;
    let frame = 0;
    let lastShot = 0;
    let lastRing = 0;
    let lastAim = 0;
    let lastSpiral = 0;
    let ringIndex = 0;
    let stopped = false;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.add(key);
      if (
        [
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
          'z',
          'shift',
        ].includes(key)
      ) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: globalThis.KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };
    const onBlur = () => {
      keys.clear();
      pointer.down = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.focus();

    const spawnRing = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const count = elapsed > 22 ? 28 : elapsed > 10 ? 24 : 20;
      const speed = elapsed > 22 ? 142 : elapsed > 10 ? 124 : 108;
      const offset = ringIndex * 0.17;
      for (let index = 0; index < count; index += 1) {
        const angle = offset + (index / count) * Math.PI * 2;
        bullets.push({
          x: boss.x,
          y: boss.y + 22,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 5.3,
          color: index % 2 === 0 ? '#ff4c81' : '#84d8ff',
          kind: index % 3 === 0 ? 'petal' : 'orb',
        });
      }
      ringIndex += 1;
    };

    const spawnAimedFan = () => {
      const base = Math.atan2(player.y - boss.y, player.x - boss.x);
      for (const offset of [-0.25, -0.12, 0, 0.12, 0.25]) {
        const angle = base + offset;
        bullets.push({
          x: boss.x,
          y: boss.y + 28,
          vx: Math.cos(angle) * 186,
          vy: Math.sin(angle) * 186,
          radius: 4.6,
          color: '#fff0f6',
          kind: 'petal',
        });
      }
    };

    const spawnSpiral = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const angle = elapsed * 2.4;
      for (const direction of [-1, 1]) {
        const heading = angle * direction;
        bullets.push({
          x: boss.x,
          y: boss.y + 18,
          vx: Math.cos(heading) * 98,
          vy: Math.sin(heading) * 98,
          radius: 4,
          color: direction > 0 ? '#e83765' : '#8f78ff',
          kind: 'orb',
        });
      }
    };

    const drawPixelText = (
      text: string,
      x: number,
      y: number,
      align: CanvasTextAlign = 'left',
    ) => {
      context.save();
      context.font = '700 12px "Space Mono", monospace';
      context.textAlign = align;
      context.fillStyle = 'rgba(255,255,255,.86)';
      context.fillText(text, x, y);
      context.restore();
    };

    const render = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.034);
      previous = now;
      const elapsed = (now - startedAt) / 1000;
      context.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      const background = context.createLinearGradient(0, 0, 0, ARENA_HEIGHT);
      background.addColorStop(0, '#130817');
      background.addColorStop(0.55, '#090711');
      background.addColorStop(1, '#020307');
      context.fillStyle = background;
      context.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      context.save();
      context.globalAlpha = 0.2;
      context.strokeStyle = '#b33a61';
      context.lineWidth = 1;
      for (let x = -40; x < ARENA_WIDTH + 80; x += 48) {
        context.beginPath();
        context.moveTo(x + Math.sin(elapsed * 0.45) * 12, 0);
        context.lineTo(x - 120, ARENA_HEIGHT);
        context.stroke();
      }
      for (let y = 44; y < ARENA_HEIGHT; y += 44) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(ARENA_WIDTH, y);
        context.stroke();
      }
      context.restore();

      boss.x = ARENA_WIDTH / 2 + Math.sin(elapsed * 0.72) * 175;
      boss.y = 106 + Math.sin(elapsed * 1.3) * 17;

      pointer.down = canvas.dataset.pointerDown === 'true';
      pointer.x = Number(canvas.dataset.pointerX) || pointer.x;
      pointer.y = Number(canvas.dataset.pointerY) || pointer.y;
      const focused = keys.has('shift');
      const speed = focused ? 148 : 286;
      let dx = 0;
      let dy = 0;
      if (keys.has('arrowleft') || keys.has('a')) {
        dx -= 1;
      }
      if (keys.has('arrowright') || keys.has('d')) {
        dx += 1;
      }
      if (keys.has('arrowup') || keys.has('w')) {
        dy -= 1;
      }
      if (keys.has('arrowdown') || keys.has('s')) {
        dy += 1;
      }
      if (dx !== 0 || dy !== 0) {
        const magnitude = Math.hypot(dx, dy);
        player.x += (dx / magnitude) * speed * delta;
        player.y += (dy / magnitude) * speed * delta;
      } else if (pointer.down) {
        const distance = Math.hypot(pointer.x - player.x, pointer.y - player.y);
        if (distance > 3) {
          const pointerSpeed = Math.min(speed * delta, distance);
          player.x += ((pointer.x - player.x) / distance) * pointerSpeed;
          player.y += ((pointer.y - player.y) / distance) * pointerSpeed;
        }
      }
      player.x = clamp(player.x, 22, ARENA_WIDTH - 22);
      player.y = clamp(player.y, 235, ARENA_HEIGHT - 24);

      if ((keys.has('z') || pointer.down) && now - lastShot > 88) {
        shots.push(
          { x: player.x - 7, y: player.y - 16, vy: -710 },
          { x: player.x + 7, y: player.y - 16, vy: -710 },
        );
        lastShot = now;
      }

      if (elapsed > 1.2 && now - lastRing > (elapsed > 22 ? 770 : 980)) {
        spawnRing(now);
        lastRing = now;
      }
      if (elapsed > 3 && now - lastAim > 640) {
        spawnAimedFan();
        lastAim = now;
      }
      if (elapsed > 8 && now - lastSpiral > 145) {
        spawnSpiral(now);
        lastSpiral = now;
      }

      for (let index = shots.length - 1; index >= 0; index -= 1) {
        const shot = shots[index];
        shot.y += shot.vy * delta;
        if (
          Math.hypot(shot.x - boss.x, shot.y - boss.y) <
          (image.complete ? 45 : 32)
        ) {
          boss.hp -= 1;
          shots.splice(index, 1);
          if (boss.hp % 4 === 0) {
            setBossHp(Math.max(0, boss.hp));
          }
          continue;
        }
        if (shot.y < -20) {
          shots.splice(index, 1);
        }
      }

      for (let index = bullets.length - 1; index >= 0; index -= 1) {
        const bullet = bullets[index];
        bullet.x += bullet.vx * delta;
        bullet.y += bullet.vy * delta;
        if (
          bullet.x < -40 ||
          bullet.x > ARENA_WIDTH + 40 ||
          bullet.y < -50 ||
          bullet.y > ARENA_HEIGHT + 50
        ) {
          bullets.splice(index, 1);
          continue;
        }
        if (
          now > player.invulnerableUntil &&
          Math.hypot(bullet.x - player.x, bullet.y - player.y) <
            bullet.radius + 3.8
        ) {
          player.lives -= 1;
          player.invulnerableUntil = now + 1450;
          bullets.splice(0, bullets.length);
          setLives(player.lives);
          if (player.lives <= 0) {
            stopped = true;
            onDefeat();
            return;
          }
          break;
        }
      }

      if (boss.hp <= 0) {
        stopped = true;
        setBossHp(0);
        onVictory();
        return;
      }

      context.save();
      context.translate(boss.x, boss.y);
      const aura = context.createRadialGradient(0, 0, 10, 0, 0, 88);
      aura.addColorStop(0, 'rgba(255,38,93,.42)');
      aura.addColorStop(0.5, 'rgba(190,16,67,.14)');
      aura.addColorStop(1, 'rgba(160,0,40,0)');
      context.fillStyle = aura;
      context.beginPath();
      context.arc(0, 0, 88 + Math.sin(elapsed * 4) * 6, 0, Math.PI * 2);
      context.fill();
      if (image.complete) {
        context.drawImage(image, -58, -58, 116, 116);
      } else {
        context.fillStyle = '#b91e4f';
        context.beginPath();
        context.arc(0, 0, 34, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      for (const shot of shots) {
        context.save();
        context.shadowBlur = 11;
        context.shadowColor = '#c5f7ff';
        context.fillStyle = '#eefeff';
        context.fillRect(shot.x - 2, shot.y - 8, 4, 14);
        context.restore();
      }

      for (const bullet of bullets) {
        context.save();
        context.translate(bullet.x, bullet.y);
        context.rotate(
          bullet.kind === 'petal' ? Math.atan2(bullet.vy, bullet.vx) : 0,
        );
        context.shadowBlur = 8;
        context.shadowColor = bullet.color;
        context.fillStyle = bullet.color;
        context.strokeStyle = 'rgba(255,255,255,.82)';
        context.lineWidth = 1;
        context.beginPath();
        if (bullet.kind === 'petal') {
          context.ellipse(0, 0, bullet.radius * 1.8, bullet.radius, 0, 0, 7);
        } else {
          context.arc(0, 0, bullet.radius, 0, Math.PI * 2);
        }
        context.fill();
        context.stroke();
        context.restore();
      }

      const playerVisible =
        now > player.invulnerableUntil ||
        Math.floor((player.invulnerableUntil - now) / 85) % 2 === 0;
      if (playerVisible) {
        context.save();
        context.translate(player.x, player.y);
        context.rotate(Math.PI / 4);
        context.shadowBlur = 16;
        context.shadowColor = '#7eeaff';
        context.fillStyle = '#e7fcff';
        context.fillRect(-8, -8, 16, 16);
        context.strokeStyle = '#55cced';
        context.lineWidth = 2;
        context.strokeRect(-10, -10, 20, 20);
        context.restore();
      }
      if (focused) {
        context.save();
        context.fillStyle = '#ff315f';
        context.shadowBlur = 9;
        context.shadowColor = '#ff315f';
        context.beginPath();
        context.arc(player.x, player.y, 3.8, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      drawPixelText('SCARLET SIGN // FUMO FORM', 18, 26);
      drawPixelText(
        `${Math.floor(elapsed / 60)
          .toString()
          .padStart(2, '0')}:${Math.floor(elapsed % 60)
          .toString()
          .padStart(2, '0')}`,
        ARENA_WIDTH - 18,
        26,
        'right',
      );

      if (!stopped) {
        frame = requestAnimationFrame(render);
      }
    };

    frame = requestAnimationFrame((now) => {
      startedAt = now;
      previous = now;
      render(now);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [onDefeat, onVictory]);

  const updatePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ARENA_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * ARENA_HEIGHT;
    canvas.dataset.pointerX = `${x}`;
    canvas.dataset.pointerY = `${y}`;
  };

  return (
    <div className="cx-remilia-fight">
      <header className="cx-remilia-fight-hud">
        <div>
          <span>紅魔符 // SCARLET DEVIL</span>
          <strong>レミリア・スカーレット</strong>
        </div>
        <div
          className="cx-remilia-life"
          aria-label={`${lives} lives remaining`}
        >
          {Array.from({ length: PLAYER_LIVES }, (_, index) => (
            <i key={index} className={index < lives ? 'is-live' : ''} />
          ))}
        </div>
      </header>
      <div
        className="cx-remilia-boss-health"
        role="progressbar"
        aria-label="Remilia health"
        aria-valuemin={0}
        aria-valuemax={BOSS_MAX_HP}
        aria-valuenow={bossHp}
      >
        <i style={{ width: `${(bossHp / BOSS_MAX_HP) * 100}%` }} />
      </div>
      <canvas
        ref={canvasRef}
        width={ARENA_WIDTH}
        height={ARENA_HEIGHT}
        tabIndex={0}
        role="application"
        aria-label="Remilia Fumo boss fight. Move with arrow keys or WASD. Hold Z to fire. Hold Shift for precise movement. Mouse and touch dragging also move and fire."
        onPointerDown={(event) => {
          updatePointer(event);
          event.currentTarget.dataset.pointerDown = 'true';
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
        }}
        onPointerMove={updatePointer}
        onPointerUp={(event) => {
          event.currentTarget.dataset.pointerDown = 'false';
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          event.currentTarget.dataset.pointerDown = 'false';
        }}
      />
      <footer className="cx-remilia-controls">
        <span>MOVE</span> WASD / ARROWS
        <span>FOCUS</span> SHIFT
        <span>FIRE</span> HOLD Z / DRAG
      </footer>
    </div>
  );
};

export const RemiliaBossSequence: FC<{
  onComplete: () => void;
  onDefeat: () => void;
}> = ({ onComplete, onDefeat }) => {
  const themeRef = useRef<HTMLAudioElement>(null);
  const victoryRef = useRef<HTMLAudioElement>(null);
  const completionTimerRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const [phase, setPhase] = useState<SequencePhase>('breach');
  const [epilogueReady, setEpilogueReady] = useState(false);

  const scheduleCompletion = useCallback(
    (delayMs: number) => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      }, delayMs);
    },
    [onComplete],
  );

  useEffect(() => {
    if (phase !== 'breach') {
      return;
    }
    const stopFx = playBreachFx();
    const reveal = window.setTimeout(() => setPhase('reveal'), 1650);
    return () => {
      window.clearTimeout(reveal);
      stopFx();
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'reveal') {
      return;
    }
    const theme = themeRef.current;
    let stopFade: () => void = () => undefined;
    let cancelled = false;
    if (theme) {
      theme.currentTime = 0;
      theme.volume = 0;
      theme.playbackRate = 1;
      void theme
        .play()
        .then(() => {
          if (!cancelled) {
            stopFade = fadeAudio(theme, 0.78, 2900);
          }
        })
        .catch(() => undefined);
    }
    const dialogue = window.setTimeout(() => setPhase('dialogue'), 2050);
    return () => {
      cancelled = true;
      window.clearTimeout(dialogue);
      stopFade();
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'dialogue') {
      return;
    }
    const fight = window.setTimeout(() => setPhase('fight'), 5600);
    return () => window.clearTimeout(fight);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'victory') {
      return;
    }
    playImpactFx();
    const theme = themeRef.current;
    const stopFade = theme ? fadeAudio(theme, 0, 620) : () => undefined;
    const epilogue = window.setTimeout(() => setPhase('epilogue'), 900);
    return () => {
      stopFade();
      window.clearTimeout(epilogue);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'epilogue') {
      return;
    }
    const theme = themeRef.current;
    if (theme) {
      theme.pause();
    }
    const voice = victoryRef.current;
    if (voice) {
      voice.currentTime = 0;
      voice.volume = 0.92;
      scheduleCompletion(12_000);
      void voice
        .play()
        .then(() => setEpilogueReady(true))
        .catch(() => {
          setEpilogueReady(true);
          scheduleCompletion(4200);
        });
    } else {
      setEpilogueReady(true);
      scheduleCompletion(4200);
    }
  }, [phase, scheduleCompletion]);

  useEffect(() => {
    if (phase !== 'defeat') {
      return;
    }
    const stopFx = playDefeatFx();
    const theme = themeRef.current;
    const stopFade = theme ? fadeAudio(theme, 0.08, 4000) : () => undefined;
    if (theme) {
      theme.playbackRate = 0.78;
      theme.preservesPitch = false;
    }
    const close = window.setTimeout(onDefeat, 4300);
    return () => {
      stopFx();
      stopFade();
      window.clearTimeout(close);
    };
  }, [onDefeat, phase]);

  useEffect(
    () => () => {
      themeRef.current?.pause();
      victoryRef.current?.pause();
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    },
    [],
  );

  const handleVictory = useCallback(() => setPhase('victory'), []);
  const handleDefeat = useCallback(() => setPhase('defeat'), []);

  return (
    <section
      className={`cx-remilia-sequence is-${phase}`}
      data-phase={phase}
      aria-label="Remilia Fumo hidden boss encounter"
    >
      <div className="cx-remilia-noise" aria-hidden="true" />
      {(phase === 'breach' || phase === 'defeat') && (
        <div className="cx-remilia-rumble" aria-hidden="true" />
      )}
      {phase === 'breach' && (
        <div className="cx-remilia-breach-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
      {(phase === 'reveal' || phase === 'dialogue') && (
        <div className="cx-remilia-introduction">
          <div className="cx-remilia-moon" aria-hidden="true" />
          <img src={REMILIA_FUMO_URL} alt="Remilia Scarlet Fumo" />
          {phase === 'dialogue' && (
            <div className="cx-remilia-vn-box" role="dialog" aria-live="polite">
              <strong>レミリア・スカーレット</strong>
              <p>
                <span>{REMILIA_DIALOGUE_LINES[0]}</span>
                <span>{REMILIA_DIALOGUE_LINES[1]}</span>
              </p>
              <i aria-hidden="true" />
            </div>
          )}
        </div>
      )}
      {phase === 'fight' && (
        <RemiliaBossGame onVictory={handleVictory} onDefeat={handleDefeat} />
      )}
      {phase === 'victory' && (
        <div className="cx-remilia-finisher" aria-hidden="true">
          <i />
          <span>FINAL HIT</span>
        </div>
      )}
      {phase === 'epilogue' && (
        <div
          className={`cx-remilia-epilogue ${epilogueReady ? 'is-ready' : ''}`}
        >
          <span>SCARLET DEVIL // SPELL BROKEN</span>
          <strong>……今回は、あなたの勝ちよ。</strong>
        </div>
      )}
      {phase === 'defeat' && (
        <div className="cx-remilia-defeat">
          <span>紅霧がすべてを覆う</span>
          <strong>CONTINUE?</strong>
          <b>0</b>
        </div>
      )}
      <audio
        ref={themeRef}
        data-remilia-audio="theme"
        src={REMILIA_THEME_URL}
        preload="auto"
      />
      <audio
        ref={victoryRef}
        data-remilia-audio="victory"
        src={REMILIA_VICTORY_URL}
        preload="auto"
        onEnded={() => {
          scheduleCompletion(850);
        }}
      />
    </section>
  );
};
