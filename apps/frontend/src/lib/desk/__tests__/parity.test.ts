import { describe, expect, it } from 'vitest';
import fixtureFile from '../__fixtures__/desk-golden.json';
import { computeJournalStats, computeNavChain, computeSizing, evaluateGate } from '../deskCalculations';
import type { DeskJournalEntry, DeskPosition, MandateParams, NavChainInput, TradePlanInput } from '@/types/desk';

interface FixtureCase {
  name: string;
  input: {
    mandate: MandateParams;
    gateMandate: MandateParams | null;
    navChainInput: NavChainInput;
    positions: DeskPosition[];
    journalEntries: DeskJournalEntry[];
    tradePlanInput: TradePlanInput | null;
    asOfDate: string;
  };
  expected: {
    navChain: Record<string, unknown>;
    sizing: Record<string, unknown> | null;
    journalStats: Record<string, unknown>;
    gate: {
      rows: { id: string; state: string; notImplemented: boolean }[];
      overall: string;
      blockingReasons: string[];
    };
  };
}

const cases = (fixtureFile as { cases: FixtureCase[] }).cases;

const NUMERIC_TOLERANCE = 6;

function expectNumericClose(actual: unknown, expected: unknown, path: string) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    expect(actual, path).toBeCloseTo(expected, NUMERIC_TOLERANCE);
  } else {
    expect(actual, path).toEqual(expected);
  }
}

describe('desk engine TS/C# parity (desk-golden.json)', () => {
  it.each(cases)('$name', (testCase) => {
    const { input, expected } = testCase;
    const chain = computeNavChain(input.navChainInput);
    const sizing = input.tradePlanInput ? computeSizing(input.tradePlanInput, chain, input.mandate) : null;
    const journalStats = computeJournalStats(input.journalEntries);
    const gateMandate = input.gateMandate ?? input.mandate;
    const gate = evaluateGate({
      chain, sizing, inputs: input.tradePlanInput, mandate: gateMandate, journalStats,
      journalEntries: input.journalEntries, positions: input.positions, asOfDate: input.asOfDate,
    });

    // NAV chain — numeric fields close, everything else exact
    for (const [key, value] of Object.entries(expected.navChain)) {
      if (key === 'regime') continue;
      expectNumericClose((chain as unknown as Record<string, unknown>)[key], value, `navChain.${key}`);
    }
    expect(chain.regime.name).toBe((expected.navChain.regime as { name: string }).name);
    expect(chain.regime.multiplier).toBeCloseTo((expected.navChain.regime as { multiplier: number }).multiplier, NUMERIC_TOLERANCE);

    // Sizing
    if (expected.sizing == null) {
      expect(sizing).toBeNull();
    } else {
      expect(sizing).not.toBeNull();
      expect(sizing!.valid).toBe(expected.sizing.valid);
      expect(sizing!.reason).toBe(expected.sizing.reason);
      if (sizing!.valid) {
        for (const key of ['unitRisk', 'finalQty', 'finalLots', 'plannedLoss', 'plannedReward', 'rr', 'exposurePct', 'heatAfter']) {
          expectNumericClose((sizing as unknown as Record<string, unknown>)[key], (expected.sizing as Record<string, unknown>)[key], `sizing.${key}`);
        }
      }
    }

    // Journal stats
    for (const [key, value] of Object.entries(expected.journalStats)) {
      expectNumericClose((journalStats as unknown as Record<string, unknown>)[key], value, `journalStats.${key}`);
    }

    // Gate — byte-identical rule states is the actual acceptance criterion
    expect(gate.overall).toBe(expected.gate.overall);
    expect(gate.rows.map(r => ({ id: r.id, state: r.state, notImplemented: r.notImplemented })))
      .toEqual(expected.gate.rows.map(r => ({ id: r.id, state: r.state, notImplemented: r.notImplemented })));
    expect(gate.blockingReasons).toEqual(expected.gate.blockingReasons);

    // Structural invariant: no rule renders pass while notImplemented.
    expect(gate.rows.some(r => r.state === 'pass' && r.notImplemented)).toBe(false);
  });
});
