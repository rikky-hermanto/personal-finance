// Macro Scenario Lab — domain types. Framework-free: no React, no DOM.
// Ported from docs/reference/simulator-makro-v3.jsx.

/** Exogenous drivers — the only things a user can move. Everything else is computed. */
export interface MacroDrivers {
  // Monetary & fiscal policy
  i: number; // policy rate (BI rate), %
  target: number; // inflation target, %
  pie: number; // inflation expectations, %
  deficit: number; // budget deficit, % GDP
  debtRatio: number; // government debt ratio, % GDP
  // Supply & labor
  w: number; // nominal wage growth, %
  prod: number; // productivity growth, %
  shock: number; // supply shock to CPI, pp
  informal: number; // informal-sector share, %
  // Global
  iFed: number; // Fed funds rate, %
  piG: number; // developed-market inflation, %
  gG: number; // global growth, %
  dxy: number; // dollar index, YoY %
  riskOn: number; // global risk appetite, 0-100
  // Energy, commodities, external position
  oil: number; // Brent oil price, YoY %
  commod: number; // export commodity price, YoY %
  subsidy: number; // energy subsidy coverage, 0-100
  fxDebt: number; // corporate FX debt, % GDP
  reserves: number; // FX reserves, months of import cover
}

/** One component of the capital-flow decomposition — UI needs the raw value alongside the score contribution. */
export interface CapitalFlowComponent {
  label: string;
  contribution: number; // scored contribution to the 0-100 flow index
  raw: string; // human-readable raw driver value, e.g. "+1.2 pp"
}

/** Core macro state returned by solveMacro() — everything that is a RESULT, not a choice. */
export interface MacroState {
  // Inflation & growth
  pi: number; // headline CPI inflation, %
  g: number; // real GDP growth, %
  gPot: number; // potential growth, %
  gap: number; // output gap, pp
  piGap: number; // inflation gap vs target, pp
  ulc: number; // unit labor cost growth, %
  r: number; // real policy rate, ex-ante
  rEx: number; // real policy rate, ex-post
  rG: number; // global real rate
  // Labor market
  u: number; // open unemployment, %
  underemp: number; // underemployment, %
  jobGrowth: number; // job growth, %
  // FX & capital flows
  idr: number; // IDR move vs USD, % (negative = depreciation)
  flow: number; // capital flow index, -100..100
  flowParts: CapitalFlowComponent[]; // 8-component decomposition
  // Household-felt prices
  foodInfl: number;
  fuelPrice: number;
  rentGrowth: number;
  cpiBottom: number; // felt inflation (bottom-40% household basket)
  feltGap: number; // cpiBottom - pi
  spendingWeightSource: 'personal' | 'default'; // set by solveMacro when custom weights are passed in
  // Rates & yields
  sbnYield: number; // 10Y government bond yield, %
  taylor: number; // Taylor-rule implied rate, %
  fxStress: number;
  credibility: number; // 0-100
  // Banks
  costOfFunds: number;
  nim: number;
  realCredit: number;
  npl: number;
  // Corporates
  nomRev: number;
  costGrowth: number;
  costLabor: number;
  costImport: number;
  costRent: number;
  costCapital: number;
  fxDebtHit: number;
  marginDelta: number;
  // Government
  subsidyCost: number; // % GDP
  deficitActual: number; // % GDP
  interestBurden: number; // % GDP
  debtNext: number; // % GDP next year
  // People
  kpr: number; // consumer/mortgage lending rate, %
  savingsReal: number;
  realWage: number;
  realWageFelt: number; // real wage deflated by felt inflation, not headline
  rentBurden: number;
}

export type InstrumentCategory = 'Domestic' | 'Global';

export interface InstrumentView {
  name: string;
  category: InstrumentCategory;
  driver: string; // one-line description of what moves this instrument
  realReturnPct: number; // real IDR return, %
  beta: number; // sensitivity to global risk appetite
  sentiment: number; // 0-100 fear/greed
  flag: 'crowded' | 'hated-but-cheap' | null;
}

/** Blended real return of a weighted instrument basket (default weights or a real user portfolio). */
export interface PortfolioAggregate {
  realReturnPct: number;
  investorScore: number; // -100..100, scaled from realReturnPct
}

export interface StakeholderStat {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
  sub?: string;
}

export type StakeholderKey = 'cb' | 'bank' | 'corp' | 'gov' | 'inv' | 'people';

export interface StakeholderRow {
  key: StakeholderKey;
  name: string;
  subtitle: string;
  score: number; // -100..100
  stats: StakeholderStat[];
  mechanism: string; // narrative explaining the dominant channel this scenario
}

export type Regime =
  | 'Extreme inflation + contraction'
  | 'Extreme inflation'
  | 'Deflation-depression'
  | 'Deflation'
  | 'Stagflation'
  | 'Overheating'
  | 'Disinflationary recession'
  | 'Goldilocks'
  | 'Neutral';

export interface RegimeClassification {
  regime: Regime;
  regimeNote: string;
}

/** Full computed output for one scenario: core state + instruments + stakeholders + regime. */
export interface MacroScenarioResult {
  drivers: MacroDrivers;
  state: MacroState;
  instruments: InstrumentView[];
  portfolio: PortfolioAggregate;
  stakeholders: StakeholderRow[];
  regime: RegimeClassification;
  flowNarrative: string;
}

export interface SliderDef {
  key: keyof MacroDrivers;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  tier: 'primary' | 'advanced';
}

export interface DriverGroup {
  title: string;
  items: SliderDef[];
}

export interface ScenarioPreset {
  label: string;
  drivers: MacroDrivers;
}
