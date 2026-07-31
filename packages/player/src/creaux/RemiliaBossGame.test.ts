import { describe, expect, it } from 'vitest';

import {
  calculateBattleScale,
  getCrystalBreakState,
  getOpeningAttackStage,
  getPlayerSpeed,
  getRemiliaSpellIndex,
  REMILIA_SPELLS,
} from './RemiliaBossGame';

describe('RemiliaBossGame progression', () => {
  it('uniformly scales until the full combat frame touches a viewport edge', () => {
    const heightLimited = calculateBattleScale(1280, 760);
    expect(heightLimited * 668).toBeCloseTo(760, 5);
    expect(heightLimited * 808).toBeLessThan(1280);

    const widthLimited = calculateBattleScale(700, 900);
    expect(widthLimited * 808).toBeCloseTo(700, 5);
    expect(widthLimited * 668).toBeLessThan(900);
  });

  it('stages the opening attack as charge, lock, strike, rupture, then release', () => {
    expect(getOpeningAttackStage(0)).toBe(0);
    expect(getOpeningAttackStage(1.1)).toBe(1);
    expect(getOpeningAttackStage(1.8)).toBe(2);
    expect(getOpeningAttackStage(2.35)).toBe(3);
    expect(getOpeningAttackStage(4.8)).toBe(4);
  });

  it('advances through three authored spell cards at fixed health gates', () => {
    expect(REMILIA_SPELLS).toHaveLength(3);
    expect(getRemiliaSpellIndex(480)).toBe(0);
    expect(getRemiliaSpellIndex(321)).toBe(0);
    expect(getRemiliaSpellIndex(320)).toBe(1);
    expect(getRemiliaSpellIndex(160)).toBe(2);
    expect(getRemiliaSpellIndex(1)).toBe(2);
  });

  it('makes focus mechanically slower and gates Crystal Break with explicit states', () => {
    expect(getPlayerSpeed(false)).toBe(196);
    expect(getPlayerSpeed(true)).toBe(106);
    expect(getCrystalBreakState(true, 100)).toBe('opening');
    expect(getCrystalBreakState(false, 99.9)).toBe('charging');
    expect(getCrystalBreakState(false, 100)).toBe('ready');
  });
});
