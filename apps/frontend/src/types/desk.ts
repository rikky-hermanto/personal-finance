export type GateState = 'pass' | 'warning' | 'blocked' | 'unresolved';
export type GateOverall = 'PASS' | 'WARNING' | 'BLOCKED';

export interface Regime {
  name: string;
  drawdownPct: number;
  multiplier: number;
}

export interface NavChain {
  tentativeNav: number;
  stockbitAmt: number;
  included: boolean;
  reconciledNav: number;
  legacyMv: number;
  reserve: number;
  activeTradingNav: number;
  regime: Regime;
  adjustedRiskBudget: number;
  openRisk: number;
  heat: number;
  dailyLossLimit: number;
  dailyHeadroom: number;
}

export interface SizingCap {
  key: string;
  label: string;
  qty: number;
}

export interface Sizing {
  valid: boolean;
  reason: string | null;
  unitRisk: number | null;
  caps: SizingCap[] | null;
  binding: string | null;
  riskSizedQty: number | null;
  exposureCappedQty: number | null;
  cashCappedQty: number | null;
  finalQty: number | null;
  finalLots: number | null;
  plannedLoss: number | null;
  plannedReward: number | null;
  rr: number | null;
  exposurePct: number | null;
  heatAfter: number | null;
}

export interface GateRule {
  id: string;
  name: string;
  state: GateState;
  value: string;
  limit: string;
  headroom: string;
  reasonText: string | null;
  why: string;
  notImplemented: boolean;
}

export interface GateResult {
  rows: GateRule[];
  overall: GateOverall;
  blockingReasons: string[];
}

export interface JournalStats {
  closed: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  expectancyR: number;
  profitFactor: number | null;
  complianceRate: number;
  consecutiveLosses: number;
  compliantCount: number;
}

export interface MandateParams {
  preset: string;
  activeTradingNav: number;
  activeTradingNavMode: 'absolute' | 'pctOfReconciled';
  activeTradingNavPct: number | null;
  activeTradingNavApproved: boolean;
  riskPerTradePct: number;
  hardCeilingPct: number;
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
  monthlyLossLimitPct: number;
  normalHeatPct: number;
  hardHeatPct: number;
  clusterHeatPct: number;
  maxSingleStockPct: number;
  maxCryptoSymbolPct: number;
  maxAltcoinPct: number;
  minRR: number;
  consecutiveLossStop: number;
  reviewAt: number;
  leverageEnabled: boolean;
  averagingDownEnabled: boolean;
}

export interface TradePlanInput {
  side: 'long' | 'short' | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  buyFeePct: number;
  sellFeePct: number;
  slippagePct: number;
  availableCash: number;
  qtyStep: number;
  symbol: string | null;
}

export interface NavChainInput {
  tentativeNav: number;
  reconciledNavExclStockbit: number;
  legacyMv: number;
  stockbitDuplicateCash: number;
  stockbitResolution: string | null;
  openRisk: number;
  todaysRealizedPnl: number;
  drawdownRegime: string;
  mandate: MandateParams;
}

export interface DeskBrokerAccount {
  id: string;
  externalKey: string;
  name: string;
  currency: string;
  reportedEquity: number;
  reportedEquityNative: number | null;
  cash: number;
  cashNative: number | null;
  cashCurrencyNative: string | null;
  buyingPower: number | null;
  buyingPowerCurrency: string | null;
  status: string;
}

export interface DeskPosition {
  id: string;
  broker: string;
  symbol: string;
  assetClass: string;
  qty: number | null;
  qtyShares: number | null;
  qtyLots: number | null;
  avgPrice: number | null;
  avgPriceNative: number | null;
  lastPrice: number | null;
  lastPriceNative: number | null;
  costIdr: number;
  mvIdr: number;
  pnlIdr: number;
  pnlPct: number;
  weight: number;
  sleeve: string;
  stopPrice: number | null;
  unconfirmed: boolean;
  estimatedCostBasis: boolean;
}

export interface DeskReconIssue {
  id: string;
  externalKey: string;
  label: string;
  account: string;
  amount: number | null;
  currency: string | null;
  resolution: string;
  options: string[][];
  resolvedAt: string | null;
}

export interface DeskJournalEntry {
  id: string;
  tradeDate: string;
  symbol: string;
  broker: string;
  strategy: string | null;
  plannedQty: number | null;
  actualQty: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  netPnl: number;
  realizedR: number | null;
  compliant: boolean;
  tags: string[];
}

export interface DeskMandateVersion {
  id: string;
  version: number;
  status: 'draft' | 'approved';
  preset: string | null;
  params: MandateParams;
  effectiveDate: string | null;
  changeReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface DeskState {
  accounts: DeskBrokerAccount[];
  positions: DeskPosition[];
  reconIssues: DeskReconIssue[];
  journal: DeskJournalEntry[];
  mandateVersions: DeskMandateVersion[];
  activeMandate: DeskMandateVersion | null;
  navChain: NavChain;
  gate: GateResult;
  journalStats: JournalStats;
  drawdownRegime: string;
  stockbitResolution: string;
}
