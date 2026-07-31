import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import './remilia-game.css';

const REMILIA_FUMO_URL = new URL('./assets/remilia-fumo.png', import.meta.url)
  .href;

const FIELD_WIDTH = 384;
const FIELD_HEIGHT = 560;
const PLAYER_LIVES = 4;
const BOSS_MAX_HP = 480;
const SPELL_HP = 160;
const OPENING_DURATION = 4.8;
const BATTLE_BASE_WIDTH = 808;
const BATTLE_BASE_HEIGHT = 668;

export const calculateBattleScale = (width: number, height: number) =>
  Math.max(
    0.25,
    Math.min(width / BATTLE_BASE_WIDTH, height / BATTLE_BASE_HEIGHT),
  );

const getBattleScale = () =>
  calculateBattleScale(window.innerWidth, window.innerHeight);

export const REMILIA_SPELLS = [
  {
    sign: '紅符',
    japanese: '緋色の時計仕掛け',
    english: 'CRIMSON CLOCKWORK',
  },
  {
    sign: '夜符',
    japanese: '吸血鬼の円舞曲',
    english: 'VAMPIRE WALTZ',
  },
  {
    sign: '紅魔',
    japanese: 'ふも幻想郷',
    english: 'FUMO GENSOKYO',
  },
] as const;

export const getRemiliaSpellIndex = (hp: number) => {
  if (hp > SPELL_HP * 2) {
    return 0;
  }
  if (hp > SPELL_HP) {
    return 1;
  }
  return 2;
};

export const getOpeningAttackStage = (seconds: number) => {
  if (seconds < 1.1) {
    return 0;
  }
  if (seconds < 1.8) {
    return 1;
  }
  if (seconds < 2.35) {
    return 2;
  }
  if (seconds < OPENING_DURATION) {
    return 3;
  }
  return 4;
};

export const getPlayerSpeed = (focused: boolean) => (focused ? 106 : 196);

export const getCrystalBreakState = (
  opening: boolean,
  tension: number,
): 'opening' | 'charging' | 'ready' => {
  if (opening) {
    return 'opening';
  }
  return tension >= 100 ? 'ready' : 'charging';
};

type Point = {
  x: number;
  y: number;
};

type BulletKind = 'orb' | 'rice' | 'knife' | 'bubble';
type Bullet = Point & {
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  curve: number;
  age: number;
  delay: number;
  color: '#e93d67' | '#8a7cff' | '#6dd6f0' | '#f4f0f5';
  kind: BulletKind;
  grazed: boolean;
};

type Shot = Point & {
  vy: number;
};

type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  color: string;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const easeInOut = (value: number) =>
  value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;

const createSpellAudioContext = () => {
  const Context =
    window.AudioContext ??
    (
      window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  return Context ? new Context() : null;
};

const playOpeningAttackSound = () => {
  const context = createSpellAudioContext();
  if (!context) {
    return () => undefined;
  }
  void context.resume();
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.45);
  master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 4.6);
  master.connect(context.destination);

  const charge = context.createOscillator();
  const chargeFilter = context.createBiquadFilter();
  charge.type = 'sawtooth';
  charge.frequency.setValueAtTime(48, context.currentTime);
  charge.frequency.exponentialRampToValueAtTime(
    310,
    context.currentTime + 1.72,
  );
  chargeFilter.type = 'lowpass';
  chargeFilter.frequency.setValueAtTime(120, context.currentTime);
  chargeFilter.frequency.exponentialRampToValueAtTime(
    2100,
    context.currentTime + 1.72,
  );
  charge.connect(chargeFilter).connect(master);
  charge.start();
  charge.stop(context.currentTime + 1.8);

  const impact = context.createOscillator();
  const impactGain = context.createGain();
  impact.type = 'square';
  impact.frequency.setValueAtTime(118, context.currentTime + 1.8);
  impact.frequency.exponentialRampToValueAtTime(24, context.currentTime + 2.32);
  impactGain.gain.setValueAtTime(0.0001, context.currentTime);
  impactGain.gain.setValueAtTime(0.0001, context.currentTime + 1.78);
  impactGain.gain.exponentialRampToValueAtTime(
    0.58,
    context.currentTime + 1.81,
  );
  impactGain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + 2.42,
  );
  impact.connect(impactGain).connect(context.destination);
  impact.start(context.currentTime + 1.78);
  impact.stop(context.currentTime + 2.45);

  const noiseLength = Math.floor(context.sampleRate * 0.42);
  const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const noise = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noise.length; index += 1) {
    noise[index] = (Math.random() * 2 - 1) * (1 - index / noise.length) ** 2;
  }
  const burst = context.createBufferSource();
  const burstFilter = context.createBiquadFilter();
  const burstGain = context.createGain();
  burst.buffer = noiseBuffer;
  burstFilter.type = 'bandpass';
  burstFilter.frequency.value = 960;
  burstFilter.Q.value = 0.7;
  burstGain.gain.setValueAtTime(0.36, context.currentTime + 1.8);
  burstGain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + 2.2,
  );
  burst.connect(burstFilter).connect(burstGain).connect(context.destination);
  burst.start(context.currentTime + 1.8);

  return () => {
    if (context.state !== 'closed') {
      void context.close();
    }
  };
};

const playCrystalBreakSound = () => {
  const context = createSpellAudioContext();
  if (!context) {
    return;
  }
  void context.resume();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.24, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.44);
  gain.connect(context.destination);
  [880, 1320, 1760].forEach((frequency, index) => {
    const tone = context.createOscillator();
    tone.type = 'square';
    tone.frequency.value = frequency;
    tone.connect(gain);
    tone.start(context.currentTime + index * 0.035);
    tone.stop(context.currentTime + 0.18 + index * 0.035);
  });
  window.setTimeout(() => void context.close(), 600);
};

const drawBullet = (
  context: CanvasRenderingContext2D,
  bullet: Bullet,
  alpha: number,
) => {
  const x = Math.round(bullet.x);
  const y = Math.round(bullet.y);
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.rotate(bullet.angle);
  context.lineWidth = 1;
  context.strokeStyle = '#210914';
  if (bullet.kind === 'rice' || bullet.kind === 'knife') {
    const length = bullet.kind === 'knife' ? 9 : 6;
    const width = bullet.kind === 'knife' ? 2 : 3;
    context.fillStyle = bullet.color;
    context.fillRect(-width, -length, width * 2 + 1, length * 2 + 1);
    context.strokeRect(
      -width - 0.5,
      -length - 0.5,
      width * 2 + 2,
      length * 2 + 2,
    );
    context.fillStyle = '#fff';
    context.fillRect(-1, -length + 2, 2, length);
  } else if (bullet.kind === 'bubble') {
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(0, 0, bullet.radius + 2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = bullet.color;
    context.beginPath();
    context.arc(0, 0, bullet.radius - 1, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#6a174d';
    context.fillRect(-3, -3, 6, 6);
  } else {
    context.fillStyle = bullet.color;
    context.beginPath();
    context.arc(0, 0, bullet.radius + 1, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff';
    context.fillRect(-1, -1, 3, 3);
    context.stroke();
  }
  context.restore();
};

export const RemiliaBossGame: FC<{
  onVictory: () => void;
  onDefeat: () => void;
}> = ({ onVictory, onDefeat }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fireControlRef = useRef(false);
  const focusControlRef = useRef(false);
  const breakRequestRef = useRef(0);
  const [bossHp, setBossHp] = useState(BOSS_MAX_HP);
  const [lives, setLives] = useState(PLAYER_LIVES);
  const [tension, setTension] = useState(0);
  const [score, setScore] = useState(0);
  const [spellIndex, setSpellIndex] = useState(0);
  const [openingStage, setOpeningStage] = useState(0);
  const [spellBanner, setSpellBanner] = useState(true);
  const [impactPulse, setImpactPulse] = useState(0);
  const [grazePulse, setGrazePulse] = useState(0);
  const [focusActive, setFocusActive] = useState(false);
  const [fireControlActive, setFireControlActive] = useState(false);
  const [breakNotice, setBreakNotice] = useState<{
    id: number;
    kind: 'ready' | 'locked';
    text: string;
  } | null>(null);
  const [battleScale, setBattleScale] = useState(getBattleScale);

  useEffect(() => {
    const resize = () => setBattleScale(getBattleScale());
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    const stopOpeningSound = playOpeningAttackSound();
    const image = new Image();
    image.src = REMILIA_FUMO_URL;
    const keys = new Set<string>();
    const pointer = {
      down: false,
      x: FIELD_WIDTH / 2,
      y: FIELD_HEIGHT - 62,
    };
    const player = {
      x: FIELD_WIDTH / 2,
      y: FIELD_HEIGHT - 62,
      lives: PLAYER_LIVES,
      tension: 0,
      invulnerableUntil: 0,
    };
    const boss = {
      x: FIELD_WIDTH / 2,
      y: 90,
      hp: BOSS_MAX_HP,
      invulnerableUntil: Number.POSITIVE_INFINITY,
    };
    const bullets: Bullet[] = [];
    const shots: Shot[] = [];
    const particles: Particle[] = [];
    const bossStops = [192, 96, 286, 142, 242, 192];
    let bossStopIndex = 0;
    let bossFromX = boss.x;
    let bossTargetX = bossStops[0];
    let bossMoveStartedAt = 0;
    let startedAt = performance.now();
    let phaseStartedAt = startedAt;
    let previous = startedAt;
    let frame = 0;
    let lastShot = 0;
    let lastPrimary = 0;
    let lastSecondary = 0;
    let lastHud = 0;
    let lastBossMove = 0;
    let activeSpell = 0;
    let currentOpeningStage = 0;
    let openingImpactSpawned = false;
    let openingCrossSpawned = false;
    let bombRequested = false;
    let handledBreakRequest = breakRequestRef.current;
    let lastFocusState = false;
    let scoreValue = 0;
    let stopped = false;
    let spellBannerUntil = startedAt + 1700;
    let shakeUntil = 0;

    const emitParticles = (
      x: number,
      y: number,
      color: string,
      amount: number,
      speed = 80,
    ) => {
      for (let index = 0; index < amount; index += 1) {
        const angle = (index / amount) * Math.PI * 2 + Math.random() * 0.2;
        const velocity = speed * (0.35 + Math.random() * 0.65);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: 0.45 + Math.random() * 0.35,
          color,
        });
      }
    };

    const clearBullets = (reward: boolean) => {
      for (let index = 0; index < bullets.length; index += 3) {
        const bullet = bullets[index];
        emitParticles(bullet.x, bullet.y, bullet.color, 2, 34);
      }
      if (reward) {
        scoreValue += bullets.length * 12;
      }
      bullets.length = 0;
    };

    const addBullet = (
      x: number,
      y: number,
      speed: number,
      angle: number,
      color: Bullet['color'],
      kind: BulletKind,
      options: Partial<Pick<Bullet, 'delay' | 'curve' | 'radius'>> = {},
    ) => {
      bullets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius:
          options.radius ?? (kind === 'bubble' ? 13 : kind === 'orb' ? 3 : 3),
        angle: angle + Math.PI / 2,
        curve: options.curve ?? 0,
        age: 0,
        delay: options.delay ?? 0,
        color,
        kind,
        grazed: false,
      });
    };

    const ring = (
      count: number,
      speed: number,
      offset: number,
      color: Bullet['color'],
      kind: BulletKind,
      delay = 0,
    ) => {
      for (let index = 0; index < count; index += 1) {
        addBullet(
          boss.x,
          boss.y + 12,
          speed,
          offset + (index / count) * Math.PI * 2,
          color,
          kind,
          { delay },
        );
      }
    };

    const aimedAngle = () => Math.atan2(player.y - boss.y, player.x - boss.x);

    const runOpeningPattern = (elapsed: number) => {
      const stage = getOpeningAttackStage(elapsed);
      if (stage !== currentOpeningStage) {
        currentOpeningStage = stage;
        setOpeningStage(stage);
        if (stage === 2) {
          setImpactPulse((value) => value + 1);
          shakeUntil = performance.now() + 520;
        }
      }
      if (elapsed >= 1.82 && !openingImpactSpawned) {
        openingImpactSpawned = true;
        const impactX = FIELD_WIDTH / 2;
        for (let index = 0; index < 30; index += 1) {
          const angle = Math.PI + (index / 29) * Math.PI;
          addBullet(
            impactX,
            FIELD_HEIGHT - 22,
            72 + (index % 3) * 24,
            angle,
            index % 2 ? '#e93d67' : '#f4f0f5',
            'rice',
          );
        }
      }
      if (elapsed >= 3.05 && !openingCrossSpawned) {
        openingCrossSpawned = true;
        for (let lane = 0; lane < 9; lane += 1) {
          const delay = lane * 0.075;
          addBullet(
            18 + lane * 43,
            -8,
            118,
            Math.PI / 2 + 0.22,
            '#e93d67',
            'knife',
            { delay },
          );
          addBullet(
            FIELD_WIDTH - 18 - lane * 43,
            -8,
            118,
            Math.PI / 2 - 0.22,
            '#8a7cff',
            'knife',
            { delay },
          );
        }
      }
      if (stage === 4) {
        boss.invulnerableUntil = performance.now() + 800;
        phaseStartedAt = performance.now();
        lastPrimary = performance.now();
        lastSecondary = performance.now();
        spellBannerUntil = performance.now() + 1700;
        clearBullets(false);
      }
    };

    const runClockwork = (now: number) => {
      const phaseTime = (now - phaseStartedAt) / 1000;
      if (now - lastPrimary > 820) {
        const rotation = phaseTime * 0.62;
        ring(16, 64, rotation, '#e93d67', 'rice');
        ring(16, 92, rotation + Math.PI / 16, '#f4f0f5', 'orb', 0.08);
        ring(16, 122, rotation + Math.PI / 8, '#6dd6f0', 'rice', 0.16);
        lastPrimary = now;
      }
      if (phaseTime > 3 && now - lastSecondary > 1380) {
        const aim = aimedAngle();
        for (let index = -3; index <= 3; index += 1) {
          addBullet(
            boss.x,
            boss.y + 12,
            166,
            aim + index * 0.105,
            index % 2 ? '#e93d67' : '#8a7cff',
            'knife',
          );
        }
        lastSecondary = now;
      }
    };

    const runWaltz = (now: number) => {
      const phaseTime = (now - phaseStartedAt) / 1000;
      if (now - lastPrimary > 560) {
        const aim = aimedAngle();
        for (const side of [-1, 1]) {
          for (let index = 0; index < 7; index += 1) {
            const angle =
              aim + side * (0.16 + index * 0.095) + Math.sin(phaseTime) * 0.08;
            addBullet(
              boss.x + side * 28,
              boss.y + 9,
              112 + index * 7,
              angle,
              side > 0 ? '#e93d67' : '#8a7cff',
              'rice',
              { curve: side * 0.12 },
            );
          }
        }
        lastPrimary = now;
      }
      if (now - lastSecondary > 1700) {
        for (let lane = 0; lane < 12; lane += 1) {
          const x = 18 + lane * 32;
          const offset = lane % 2 === 0 ? 0.24 : -0.24;
          addBullet(
            x,
            -10,
            124,
            Math.PI / 2 + offset,
            lane % 2 ? '#f4f0f5' : '#e93d67',
            'knife',
            { delay: lane * 0.045 },
          );
        }
        lastSecondary = now;
      }
    };

    const runGensokyo = (now: number) => {
      const phaseTime = (now - phaseStartedAt) / 1000;
      if (now - lastPrimary > 430) {
        const rotation = phaseTime * 0.9;
        for (let arm = 0; arm < 5; arm += 1) {
          const base = rotation + (arm / 5) * Math.PI * 2;
          for (let bead = 0; bead < 5; bead += 1) {
            addBullet(
              boss.x,
              boss.y + 10,
              78 + bead * 12,
              base + bead * 0.075,
              bead % 2 ? '#f4f0f5' : '#e93d67',
              'orb',
              { curve: arm % 2 ? 0.09 : -0.09, delay: bead * 0.035 },
            );
          }
        }
        lastPrimary = now;
      }
      if (now - lastSecondary > 1450) {
        const aim = aimedAngle();
        for (let index = -1; index <= 1; index += 1) {
          addBullet(
            boss.x,
            boss.y + 18,
            76 + Math.abs(index) * 10,
            aim + index * 0.28,
            index === 0 ? '#e93d67' : '#8a7cff',
            'bubble',
            { radius: 13 },
          );
        }
        lastSecondary = now;
      }
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.add(key);
      if (key === 'x' && !event.repeat) {
        bombRequested = true;
      }
      if (
        [
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
          'z',
          'x',
          'shift',
        ].includes(key)
      ) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: globalThis.KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };
    const releaseInput = () => {
      keys.clear();
      pointer.down = false;
      canvas.dataset.pointerDown = 'false';
      fireControlRef.current = false;
      focusControlRef.current = false;
      setFireControlActive(false);
      setFocusActive(false);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        releaseInput();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseInput);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.focus();

    const drawBackground = (elapsed: number) => {
      context.fillStyle = '#07040a';
      context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      const scroll = Math.floor(elapsed * 11) % 32;
      context.fillStyle = '#120711';
      for (let y = -32 + scroll; y < FIELD_HEIGHT; y += 32) {
        for (let x = 0; x < FIELD_WIDTH; x += 32) {
          if ((x / 32 + y / 32) % 2 === 0) {
            context.fillRect(x, y, 16, 2);
          }
        }
      }
      context.strokeStyle = '#351020';
      context.lineWidth = 1;
      context.strokeRect(2.5, 2.5, FIELD_WIDTH - 5, FIELD_HEIGHT - 5);
      context.strokeStyle = '#160913';
      context.strokeRect(5.5, 5.5, FIELD_WIDTH - 11, FIELD_HEIGHT - 11);
    };

    const drawOpeningAttack = (elapsed: number) => {
      const stage = getOpeningAttackStage(elapsed);
      if (stage === 0) {
        const pulse = 18 + Math.floor((elapsed * 22) % 16);
        context.strokeStyle = '#e93d67';
        context.strokeRect(
          Math.round(boss.x - pulse),
          Math.round(boss.y - pulse),
          pulse * 2,
          pulse * 2,
        );
      }
      if (stage === 1) {
        context.fillStyle = elapsed % 0.12 < 0.06 ? '#fff' : '#e93d67';
        context.fillRect(Math.round(FIELD_WIDTH / 2 - 1), 0, 3, FIELD_HEIGHT);
        context.fillStyle = '#571125';
        context.fillRect(Math.round(FIELD_WIDTH / 2 - 12), 0, 2, FIELD_HEIGHT);
        context.fillRect(Math.round(FIELD_WIDTH / 2 + 11), 0, 2, FIELD_HEIGHT);
      }
      if (stage === 2) {
        const progress = clamp((elapsed - 1.8) / 0.55, 0, 1);
        const tip = Math.floor(-80 + progress * (FIELD_HEIGHT + 150));
        context.fillStyle = '#fff';
        context.beginPath();
        context.moveTo(FIELD_WIDTH / 2, tip + 74);
        context.lineTo(FIELD_WIDTH / 2 - 9, tip + 20);
        context.lineTo(FIELD_WIDTH / 2 - 4, tip - 75);
        context.lineTo(FIELD_WIDTH / 2 + 4, tip - 75);
        context.lineTo(FIELD_WIDTH / 2 + 9, tip + 20);
        context.closePath();
        context.fill();
        context.strokeStyle = '#e3184e';
        context.lineWidth = 3;
        context.stroke();
        context.lineWidth = 1;
      }
      if (stage === 3 && elapsed < 3.05) {
        const radius = (elapsed - 2.35) * 170;
        context.strokeStyle = '#f4f0f5';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(FIELD_WIDTH / 2, FIELD_HEIGHT - 22, radius, Math.PI, 0);
        context.stroke();
        context.lineWidth = 1;
      }
    };

    const drawPlayer = (now: number, focused: boolean) => {
      if (
        now < player.invulnerableUntil &&
        Math.floor((player.invulnerableUntil - now) / 70) % 2 !== 0
      ) {
        return;
      }
      const x = Math.round(player.x);
      const y = Math.round(player.y);
      context.fillStyle = '#13222d';
      context.fillRect(x - 6, y - 6, 13, 13);
      context.fillStyle = '#69d8f2';
      context.fillRect(x - 4, y - 4, 9, 9);
      context.fillStyle = '#fff';
      context.fillRect(x - 1, y - 5, 3, 11);
      context.fillRect(x - 5, y - 1, 11, 3);
      context.fillStyle = '#e93d67';
      context.fillRect(x - 1, y - 1, 3, 3);
      if (focused) {
        context.strokeStyle = '#fff';
        context.strokeRect(x - 2.5, y - 2.5, 5, 5);
      }
    };

    const drawBoss = (elapsed: number) => {
      const x = Math.round(boss.x);
      const y = Math.round(boss.y);
      const opening = getOpeningAttackStage(elapsed) < 4;
      if (opening) {
        context.globalAlpha = 0.25;
        for (const offset of [-16, 16]) {
          if (image.complete) {
            context.drawImage(image, x - 31 + offset, y - 32, 62, 62);
          }
        }
        context.globalAlpha = 1;
      }
      context.fillStyle = '#3d0b1d';
      context.fillRect(x - 34, y - 34, 68, 68);
      context.strokeStyle = '#e93d67';
      context.strokeRect(x - 35.5, y - 35.5, 71, 71);
      if (image.complete) {
        context.drawImage(image, x - 31, y - 31, 62, 62);
      }
    };

    const render = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.034);
      previous = now;
      const elapsed = (now - startedAt) / 1000;
      const opening = getOpeningAttackStage(elapsed) < 4;
      context.save();
      if (now < shakeUntil) {
        context.translate(
          Math.floor(Math.random() * 5) - 2,
          Math.floor(Math.random() * 5) - 2,
        );
      }
      drawBackground(elapsed);

      pointer.down = canvas.dataset.pointerDown === 'true';
      pointer.x = Number(canvas.dataset.pointerX) || pointer.x;
      pointer.y = Number(canvas.dataset.pointerY) || pointer.y;
      const focused = keys.has('shift') || focusControlRef.current;
      if (focused !== lastFocusState) {
        lastFocusState = focused;
        setFocusActive(focused);
      }
      if (breakRequestRef.current !== handledBreakRequest) {
        handledBreakRequest = breakRequestRef.current;
        bombRequested = true;
      }
      const speed = getPlayerSpeed(focused);
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
        const length = Math.hypot(dx, dy);
        player.x += (dx / length) * speed * delta;
        player.y += (dy / length) * speed * delta;
      } else if (pointer.down) {
        const distance = Math.hypot(pointer.x - player.x, pointer.y - player.y);
        if (distance > 2) {
          const step = Math.min(distance, speed * delta);
          player.x += ((pointer.x - player.x) / distance) * step;
          player.y += ((pointer.y - player.y) / distance) * step;
        }
      }
      player.x = clamp(player.x, 14, FIELD_WIDTH - 14);
      player.y = clamp(player.y, 176, FIELD_HEIGHT - 18);

      if (!opening && now - lastBossMove > 1800) {
        bossFromX = boss.x;
        bossStopIndex = (bossStopIndex + 1) % bossStops.length;
        bossTargetX = bossStops[bossStopIndex];
        bossMoveStartedAt = now;
        lastBossMove = now;
      }
      if (!opening) {
        const progress = clamp((now - bossMoveStartedAt) / 620, 0, 1);
        boss.x = bossFromX + (bossTargetX - bossFromX) * easeInOut(progress);
      }

      if (
        !opening &&
        (keys.has('z') || pointer.down || fireControlRef.current) &&
        now - lastShot > 76
      ) {
        shots.push({
          x: player.x,
          y: player.y - 8,
          vy: -340,
        });
        lastShot = now;
      }

      if (currentOpeningStage < 4) {
        runOpeningPattern(elapsed);
      }
      if (!opening && activeSpell === 0) {
        runClockwork(now);
      } else if (!opening && activeSpell === 1) {
        runWaltz(now);
      } else if (!opening) {
        runGensokyo(now);
      }

      if (bombRequested) {
        bombRequested = false;
        const breakState = getCrystalBreakState(opening, player.tension);
        if (breakState === 'ready') {
          player.tension = 0;
          boss.hp = Math.max(1, boss.hp - 20);
          clearBullets(true);
          emitParticles(player.x, player.y, '#8deaff', 42, 150);
          playCrystalBreakSound();
          shakeUntil = now + 300;
          setImpactPulse((value) => value + 1);
          setBreakNotice({
            id: now,
            kind: 'ready',
            text: 'CRYSTAL BREAK',
          });
        } else {
          setBreakNotice({
            id: now,
            kind: 'locked',
            text:
              breakState === 'opening'
                ? 'FATE LOCKED'
                : `${Math.floor(player.tension)}% // NEED 100`,
          });
        }
      }

      for (let index = shots.length - 1; index >= 0; index -= 1) {
        const shot = shots[index];
        shot.y += shot.vy * delta;
        if (
          !opening &&
          now >= boss.invulnerableUntil &&
          Math.abs(shot.x - boss.x) < 31 &&
          Math.abs(shot.y - boss.y) < 30
        ) {
          boss.hp -= 1;
          scoreValue += 18;
          shots.splice(index, 1);
          if (boss.hp % 7 === 0) {
            emitParticles(shot.x, shot.y, '#f4f0f5', 3, 38);
          }
          continue;
        }
        if (shot.y < -12) {
          shots.splice(index, 1);
        }
      }

      const desiredSpell = getRemiliaSpellIndex(boss.hp);
      if (!opening && desiredSpell > activeSpell && boss.hp > 0) {
        activeSpell = desiredSpell;
        boss.invulnerableUntil = now + 1050;
        phaseStartedAt = now;
        lastPrimary = now;
        lastSecondary = now;
        spellBannerUntil = now + 1750;
        clearBullets(true);
        setSpellIndex(activeSpell);
        setSpellBanner(true);
        setImpactPulse((value) => value + 1);
      }

      if (boss.hp <= 0) {
        stopped = true;
        setBossHp(0);
        clearBullets(true);
        onVictory();
        context.restore();
        return;
      }

      for (let index = bullets.length - 1; index >= 0; index -= 1) {
        const bullet = bullets[index];
        bullet.age += delta;
        if (bullet.age >= bullet.delay) {
          const turn = bullet.curve * delta;
          if (turn !== 0) {
            const cosine = Math.cos(turn);
            const sine = Math.sin(turn);
            const vx = bullet.vx * cosine - bullet.vy * sine;
            bullet.vy = bullet.vx * sine + bullet.vy * cosine;
            bullet.vx = vx;
          }
          bullet.x += bullet.vx * delta;
          bullet.y += bullet.vy * delta;
          bullet.angle = Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2;
        }
        if (
          bullet.x < -35 ||
          bullet.x > FIELD_WIDTH + 35 ||
          bullet.y < -45 ||
          bullet.y > FIELD_HEIGHT + 45
        ) {
          bullets.splice(index, 1);
          continue;
        }
        const distance = Math.hypot(bullet.x - player.x, bullet.y - player.y);
        if (
          !bullet.grazed &&
          bullet.age >= bullet.delay &&
          distance < bullet.radius + 14 &&
          distance > bullet.radius + 3.5
        ) {
          bullet.grazed = true;
          player.tension = Math.min(100, player.tension + 2.1);
          scoreValue += 100;
          emitParticles(player.x, player.y, '#8deaff', 3, 32);
          setGrazePulse((value) => value + 1);
        }
        if (
          !opening &&
          now > player.invulnerableUntil &&
          bullet.age >= bullet.delay &&
          distance < bullet.radius + 3.5
        ) {
          player.lives -= 1;
          player.tension = Math.max(0, player.tension - 28);
          player.invulnerableUntil = now + 1450;
          clearBullets(false);
          emitParticles(player.x, player.y, '#e93d67', 28, 120);
          shakeUntil = now + 420;
          setImpactPulse((value) => value + 1);
          setLives(player.lives);
          if (player.lives <= 0) {
            stopped = true;
            onDefeat();
            context.restore();
            return;
          }
          break;
        }
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
        particle.life -= delta;
        if (particle.life <= 0) {
          particles.splice(index, 1);
        }
      }

      drawBoss(elapsed);
      if (opening) {
        drawOpeningAttack(elapsed);
      }
      for (const shot of shots) {
        context.fillStyle = '#9aeaff';
        context.fillRect(Math.round(shot.x) - 1, Math.round(shot.y) - 6, 3, 9);
        context.fillStyle = '#fff';
        context.fillRect(Math.round(shot.x), Math.round(shot.y) - 7, 1, 5);
      }
      for (const bullet of bullets) {
        const alpha =
          bullet.age < bullet.delay
            ? 0.22 + (Math.floor(bullet.age * 20) % 2) * 0.28
            : 1;
        drawBullet(context, bullet, alpha);
      }
      for (const particle of particles) {
        context.globalAlpha = clamp(particle.life * 2, 0, 1);
        context.fillStyle = particle.color;
        context.fillRect(Math.round(particle.x), Math.round(particle.y), 2, 2);
      }
      context.globalAlpha = 1;
      drawPlayer(now, focused);

      if (now >= spellBannerUntil && spellBanner) {
        setSpellBanner(false);
      }

      context.restore();
      if (now - lastHud > 85) {
        setBossHp(Math.max(0, boss.hp));
        setTension(player.tension);
        setScore(scoreValue);
        lastHud = now;
      }
      if (bullets.length > 1800) {
        bullets.splice(0, bullets.length - 1800);
      }
      if (!stopped) {
        frame = requestAnimationFrame(render);
      }
    };

    frame = requestAnimationFrame((now) => {
      startedAt = now;
      phaseStartedAt = now;
      previous = now;
      bossMoveStartedAt = now;
      lastBossMove = now;
      spellBannerUntil = now + 1700;
      render(now);
    });

    return () => {
      stopped = true;
      stopOpeningSound();
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onDefeat, onVictory]);

  const updatePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.dataset.pointerX = `${
      ((event.clientX - rect.left) / rect.width) * FIELD_WIDTH
    }`;
    event.currentTarget.dataset.pointerY = `${
      ((event.clientY - rect.top) / rect.height) * FIELD_HEIGHT
    }`;
  };

  const spell = REMILIA_SPELLS[spellIndex];
  const currentSegmentHp = bossHp <= 0 ? 0 : ((bossHp - 1) % SPELL_HP) + 1;

  return (
    <div
      className={`cx-danmaku-battle opening-stage-${openingStage} ${
        focusActive ? 'is-focus-active' : ''
      }`}
      data-testid="remilia-boss-game"
      style={
        {
          '--cx-danmaku-scale': battleScale,
        } as CSSProperties
      }
    >
      <aside className="cx-danmaku-status">
        <div className="cx-danmaku-boss-id">
          <img src={REMILIA_FUMO_URL} alt="" />
          <span>SCARLET DEVIL</span>
          <strong>レミリア</strong>
        </div>
        <dl>
          <div>
            <dt>SCORE</dt>
            <dd>{score.toString().padStart(8, '0')}</dd>
          </div>
          <div>
            <dt>PLAYER</dt>
            <dd className="cx-danmaku-lives">
              {Array.from({ length: PLAYER_LIVES }, (_, index) => (
                <i key={index} className={index < lives ? 'is-live' : ''} />
              ))}
            </dd>
          </div>
        </dl>
        <div className="cx-danmaku-spell-list" aria-label="Spell card phases">
          {REMILIA_SPELLS.map((entry, index) => (
            <i
              key={entry.english}
              className={
                index === spellIndex
                  ? 'is-current'
                  : index < spellIndex
                    ? 'is-cleared'
                    : ''
              }
            />
          ))}
        </div>
      </aside>

      <main className="cx-danmaku-field-shell">
        <div className="cx-danmaku-bossbar">
          <span>{spell.sign}</span>
          <i>
            <b
              style={{
                width: `${(currentSegmentHp / SPELL_HP) * 100}%`,
              }}
            />
          </i>
          <em>{spellIndex + 1}/3</em>
        </div>
        <canvas
          ref={canvasRef}
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          tabIndex={0}
          role="application"
          aria-label="Remilia Fumo spell-card duel. Move with arrow keys or WASD. Hold Z to fire. Hold Shift for precise movement. Press X when Scarlet Tension is full to clear bullets."
          onPointerDown={(event) => {
            updatePointer(event);
            event.currentTarget.dataset.pointerDown = 'true';
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.focus();
          }}
          onPointerMove={updatePointer}
          onPointerUp={(event) => {
            event.currentTarget.dataset.pointerDown = 'false';
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            event.currentTarget.dataset.pointerDown = 'false';
          }}
        />
        {spellBanner && openingStage >= 4 && (
          <div className="cx-danmaku-spell-banner">
            <span>{spell.sign}</span>
            <strong>「{spell.japanese}」</strong>
            <em>{spell.english}</em>
          </div>
        )}
        {openingStage < 4 && (
          <div className="cx-danmaku-opening-card">
            <span>運命宣言</span>
            <strong>「グングニルの序曲」</strong>
            <em>SCARLET FATE // GUNGNIR OVERTURE</em>
          </div>
        )}
        {impactPulse > 0 && (
          <i
            key={`impact-${impactPulse}`}
            className="cx-danmaku-impact"
            aria-hidden="true"
          />
        )}
        {grazePulse > 0 && (
          <i
            key={`graze-${grazePulse}`}
            className="cx-danmaku-graze"
            aria-hidden="true"
          >
            GRAZE
          </i>
        )}
        {focusActive && (
          <div className="cx-danmaku-focus-notice" aria-live="polite">
            FOCUS // HITBOX VISIBLE
          </div>
        )}
        {breakNotice && (
          <div
            key={breakNotice.id}
            className={`cx-danmaku-break-notice is-${breakNotice.kind}`}
            role="status"
          >
            {breakNotice.text}
          </div>
        )}
      </main>

      <aside className="cx-danmaku-command">
        <div className="cx-danmaku-tension">
          <span>SCARLET TENSION</span>
          <strong>{Math.floor(tension)}%</strong>
          <i>
            <b style={{ height: `${tension}%` }} />
          </i>
          <em className={tension >= 100 ? 'is-ready' : ''}>
            {tension >= 100 ? 'X // CRYSTAL BREAK' : 'GRAZE TO CHARGE'}
          </em>
        </div>
        <div className="cx-danmaku-controls">
          <button
            type="button"
            className={fireControlActive ? 'is-active' : undefined}
            aria-pressed={fireControlActive}
            onPointerDown={(event) => {
              fireControlRef.current = true;
              setFireControlActive(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              canvasRef.current?.focus();
            }}
            onPointerUp={(event) => {
              fireControlRef.current = false;
              setFireControlActive(false);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              fireControlRef.current = false;
              setFireControlActive(false);
            }}
          >
            <kbd>Z</kbd>
            <span>FIRE</span>
          </button>
          <button
            type="button"
            className={focusActive ? 'is-active' : undefined}
            aria-pressed={focusActive}
            onPointerDown={(event) => {
              focusControlRef.current = true;
              setFocusActive(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              canvasRef.current?.focus();
            }}
            onPointerUp={(event) => {
              focusControlRef.current = false;
              setFocusActive(false);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              focusControlRef.current = false;
              setFocusActive(false);
            }}
          >
            <kbd>SHIFT</kbd>
            <span>FOCUS</span>
          </button>
          <button
            type="button"
            onClick={() => {
              breakRequestRef.current += 1;
              canvasRef.current?.focus();
            }}
          >
            <kbd>X</kbd>
            <span>BREAK</span>
          </button>
          <small>WASD / ARROWS / DRAG</small>
        </div>
      </aside>
    </div>
  );
};
