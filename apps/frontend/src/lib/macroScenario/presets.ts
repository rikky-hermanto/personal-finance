// Macro Scenario Lab — default drivers, slider metadata, historical presets.
// Ported from docs/reference/simulator-makro-v3.jsx (BASE, GROUPS, PRESETS, lines 261-314).
// Preset labels translated to English; all numeric values are unchanged from the reference.

import type { DriverGroup, MacroDrivers, ScenarioPreset } from './types';

export const BASE: MacroDrivers = {
  i: 4.75, target: 3, pie: 2.4, deficit: 2.5,
  w: 5.5, prod: 1.6, shock: 0, informal: 58,
  iFed: 4.0, piG: 2.6, gG: 3.0, dxy: 0, riskOn: 55,
  oil: 0, commod: 5, subsidy: 60, fxDebt: 12, reserves: 6.5, debtRatio: 40,
};

export const DRIVER_GROUPS: DriverGroup[] = [
  {
    title: 'Monetary & fiscal policy',
    items: [
      { key: 'i', label: 'Policy rate (BI rate)', min: 0, max: 30, step: 0.25, unit: '%', tier: 'primary' },
      { key: 'deficit', label: 'Budget deficit', min: -2, max: 10, step: 0.1, unit: '% GDP', tier: 'primary' },
      { key: 'target', label: 'Inflation target', min: 0, max: 8, step: 0.5, unit: '%', tier: 'advanced' },
      { key: 'debtRatio', label: 'Government debt ratio', min: 10, max: 140, step: 1, unit: '% GDP', tier: 'advanced' },
    ],
  },
  {
    title: 'Supply & labor',
    items: [
      { key: 'w', label: 'Nominal wage growth', min: -10, max: 40, step: 0.1, unit: '%', tier: 'primary' },
      { key: 'prod', label: 'Productivity growth', min: -2, max: 5, step: 0.1, unit: '%', tier: 'advanced' },
      { key: 'shock', label: 'Supply shock to CPI', min: -5, max: 15, step: 0.1, unit: ' pp', tier: 'advanced' },
      { key: 'informal', label: 'Informal-sector share', min: 20, max: 78, step: 1, unit: '%', tier: 'advanced' },
    ],
  },
  {
    title: 'Global',
    items: [
      { key: 'iFed', label: 'Fed funds rate', min: 0, max: 20, step: 0.25, unit: '%', tier: 'primary' },
      { key: 'pie', label: 'Inflation expectations', min: -2, max: 25, step: 0.1, unit: '%', tier: 'primary' },
      { key: 'piG', label: 'Developed-market inflation', min: -3, max: 15, step: 0.1, unit: '%', tier: 'advanced' },
      { key: 'gG', label: 'Global growth', min: -5, max: 7, step: 0.1, unit: '%', tier: 'advanced' },
      { key: 'dxy', label: 'Dollar index (YoY)', min: -20, max: 25, step: 0.5, unit: '%', tier: 'advanced' },
      { key: 'riskOn', label: 'Global risk appetite', min: 0, max: 100, step: 1, unit: '', tier: 'advanced' },
    ],
  },
  {
    title: 'Energy, commodities & external position',
    items: [
      { key: 'oil', label: 'Brent oil price (YoY)', min: -60, max: 150, step: 1, unit: '%', tier: 'primary' },
      { key: 'commod', label: 'Export commodities (YoY)', min: -50, max: 120, step: 1, unit: '%', tier: 'advanced' },
      { key: 'subsidy', label: 'Energy subsidy coverage', min: 0, max: 100, step: 1, unit: '', tier: 'advanced' },
      { key: 'fxDebt', label: 'Corporate FX debt', min: 0, max: 45, step: 0.5, unit: '% GDP', tier: 'advanced' },
      { key: 'reserves', label: 'FX reserves', min: 0.5, max: 14, step: 0.1, unit: ' mo. imports', tier: 'advanced' },
    ],
  },
];

export const PRESETS: ScenarioPreset[] = [
  { label: 'Indonesia, normal', drivers: { ...BASE } },
  { label: 'Global Goldilocks', drivers: { ...BASE, i: 4.5, pie: 2.6, w: 6.5, prod: 2.4, iFed: 2.5, piG: 2.0, gG: 3.8, dxy: -5, riskOn: 80, oil: 5, commod: 18 } },
  { label: 'Oil shock', drivers: { ...BASE, oil: 95, commod: 40, shock: 3.5, pie: 5.5, i: 6.0, gG: 1.2, dxy: 7, riskOn: 22, subsidy: 75, deficit: 4.2 } },
  { label: 'Fed hawkish 2022', drivers: { ...BASE, iFed: 5.0, piG: 8.0, gG: 2.0, dxy: 14, riskOn: 25, i: 5.75, pie: 4.2, oil: 55, commod: 85 } },
  { label: 'Liquidity flood 2021', drivers: { ...BASE, iFed: 0.1, piG: 3.5, gG: 5.5, dxy: -5, riskOn: 92, i: 3.5, pie: 2.0, oil: 45, commod: 60, deficit: 5.5 } },
  { label: 'Deflation & liquidity trap', drivers: { ...BASE, i: 0.5, pie: 0.2, target: 2, w: 0, prod: 1.0, shock: -3, iFed: 0.5, piG: 0.5, gG: 1.0, riskOn: 45, oil: -35, commod: -28, deficit: 5 } },
  { label: 'Asian financial crisis 1998', drivers: { ...BASE, i: 30, pie: 16, target: 5, w: 12, prod: -1.5, shock: 10, deficit: 6.5, debtRatio: 70, iFed: 5.5, piG: 2.2, gG: 2.5, dxy: 15, riskOn: 6, oil: -35, commod: -28, fxDebt: 36, reserves: 1.6, subsidy: 80 } },
];
