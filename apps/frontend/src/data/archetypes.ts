export interface Archetype {
  id: string;
  label: string;
  color: string;
  glyph: string;
  tagline: string;
  thesis: string;
  risk: number;        // 1–5
  returnScore: number; // 1–5
  timeHorizon: string;
  maxDD: string;
  targetReturn: string;
  maxPositions: number;
  rebalLabel: string;
  rebalRule: string;
  primaryTags: string[];
  secondaryTags: string[];
  idxContext: string;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'capital-preservation',
    label: 'Capital Preservation',
    color: '#0EA5E9',
    glyph: '🛡️',
    tagline: 'Protect what you have',
    thesis: 'Minimise drawdowns and preserve purchasing power through low-volatility instruments. Return is secondary to stability.',
    risk: 1, returnScore: 1,
    timeHorizon: '1–3 yr', maxDD: '-5%', targetReturn: '4–7% p.a.',
    maxPositions: 10, rebalLabel: 'Quarterly',
    rebalRule: 'Rebalance when any asset drifts >3% from target.',
    primaryTags: ['bonds', 'cash', 'gold'],
    secondaryTags: ['money-market', 'T-bills'],
    idxContext: 'Suitable when IHSG P/E > 18 or in bear market. Rotate to IDR deposits and SBN.',
  },
  {
    id: 'income',
    label: 'Income',
    color: '#10B981',
    glyph: '💰',
    tagline: 'Steady cash flow',
    thesis: 'Generate reliable income through dividends, coupons, and distributions. Capital growth is a bonus.',
    risk: 2, returnScore: 2,
    timeHorizon: '3–5 yr', maxDD: '-15%', targetReturn: '8–12% p.a.',
    maxPositions: 15, rebalLabel: 'Semi-annual',
    rebalRule: 'Reinvest dividends; trim positions >20% above cost basis.',
    primaryTags: ['dividend-stocks', 'REITs', 'bonds'],
    secondaryTags: ['IDX-30 high-yield', 'property-REIT'],
    idxContext: 'Focus on LQ45 high-yield names (BBCA, TLKM, UNVR). Indonesian REITs (DIRE) for property income.',
  },
  {
    id: 'balanced',
    label: 'Balanced / Moderate',
    color: '#6366F1',
    glyph: '⚖️',
    tagline: 'Growth with guardrails',
    thesis: 'Equal-weight growth and stability. Mix of equities and fixed income for moderate long-term appreciation with manageable drawdowns.',
    risk: 3, returnScore: 3,
    timeHorizon: '5–7 yr', maxDD: '-25%', targetReturn: '12–18% p.a.',
    maxPositions: 20, rebalLabel: 'Annual',
    rebalRule: 'Annual rebalance; tactical ±5% equity tilt based on IHSG valuation.',
    primaryTags: ['equities', 'bonds', 'gold'],
    secondaryTags: ['global-ETF', 'IDX composite'],
    idxContext: '50% IDX blue-chips (BBCA, ASII, BMRI) + 30% government bonds (SBN) + 20% commodity/gold hedge.',
  },
  {
    id: 'growth',
    label: 'Growth',
    color: '#F59E0B',
    glyph: '📈',
    tagline: 'Long-run wealth building',
    thesis: 'Equity-heavy portfolio targeting long-term capital appreciation. Accepts short-term volatility for higher terminal wealth.',
    risk: 4, returnScore: 4,
    timeHorizon: '7–10 yr', maxDD: '-35%', targetReturn: '18–25% p.a.',
    maxPositions: 25, rebalLabel: 'Annual',
    rebalRule: 'Let winners run; cut positions below 3% allocation. Rebalance after >40% annual gain.',
    primaryTags: ['equities', 'growth-stocks', 'sectoral'],
    secondaryTags: ['tech', 'consumer', 'healthcare'],
    idxContext: 'Overweight IHSG growth sectors: tech (GOTO, BUKA), consumer staples (ICBP, MYOR), healthcare (KLBF).',
  },
  {
    id: 'aggressive-growth',
    label: 'Aggressive Growth',
    color: '#EF4444',
    glyph: '🚀',
    tagline: 'Maximum long-run upside',
    thesis: 'Concentrated high-conviction bets on transformative companies or sectors. Accepts deep drawdowns for outsized returns.',
    risk: 5, returnScore: 5,
    timeHorizon: '10+ yr', maxDD: '-50%', targetReturn: '>25% p.a.',
    maxPositions: 15, rebalLabel: 'Ad hoc',
    rebalRule: 'Trim only when a position >30% of portfolio. Hold through volatility.',
    primaryTags: ['small-cap', 'high-growth', 'concentrated'],
    secondaryTags: ['IPOs', 'turnarounds', 'thematic'],
    idxContext: 'IDX small-cap growth, new economy stocks. Pair with monitoring of IHSG breadth and foreign net-buy flows.',
  },
  {
    id: 'global-diversified',
    label: 'Global Diversified',
    color: '#8B5CF6',
    glyph: '🌍',
    tagline: 'Multi-asset, multi-currency',
    thesis: 'Reduce concentration in single country/currency. Geographic and asset-class diversification smooths returns across cycles.',
    risk: 3, returnScore: 3,
    timeHorizon: '5–10 yr', maxDD: '-20%', targetReturn: '10–15% p.a.',
    maxPositions: 30, rebalLabel: 'Annual',
    rebalRule: 'FX exposure check quarterly; hedge IDR/USD beyond 40% USD allocation.',
    primaryTags: ['global-ETF', 'USD-assets', 'commodities'],
    secondaryTags: ['S&P500', 'MSCI-World', 'gold'],
    idxContext: 'Via Bibit/Bareksa global funds or SBN USD. Wise account for direct USD/SGD asset holding.',
  },
  {
    id: 'crypto-digital',
    label: 'Crypto / Digital Assets',
    color: '#F97316',
    glyph: '₿',
    tagline: 'High risk, asymmetric upside',
    thesis: 'Small allocation to digital assets for asymmetric return potential. Size to lose 100% without affecting core financial goals.',
    risk: 5, returnScore: 5,
    timeHorizon: '3–7 yr', maxDD: '-80%', targetReturn: 'Asymmetric',
    maxPositions: 10, rebalLabel: 'Ad hoc',
    rebalRule: 'Cap portfolio weight at 10–15%. Take profits at 5× cost into stablecoins.',
    primaryTags: ['BTC', 'ETH', 'DeFi'],
    secondaryTags: ['stablecoins', 'L2', 'altcoins'],
    idxContext: 'Regulated via Tokocrypto/Indodax (OJK-licensed). Pair with tax planning for crypto gains under PMK-68.',
  },
  {
    id: 'esg-thematic',
    label: 'ESG / Thematic',
    color: '#14B8A6',
    glyph: '🌱',
    tagline: 'Values-aligned investing',
    thesis: 'Align portfolio with environmental, social, and governance criteria or specific macro themes (energy transition, digital infra, healthcare).',
    risk: 3, returnScore: 3,
    timeHorizon: '5–10 yr', maxDD: '-25%', targetReturn: '12–18% p.a.',
    maxPositions: 20, rebalLabel: 'Annual',
    rebalRule: 'Annual ESG-score review; exit positions failing minimum threshold.',
    primaryTags: ['ESG', 'renewable-energy', 'healthcare'],
    secondaryTags: ['green-bonds', 'impact', 'SDG'],
    idxContext: 'IDX ESG Leaders index; BBNI green bonds; PGEO (geothermal). SRI-KEHATI index as benchmark.',
  },
];

export const archetypeById = (id: string): Archetype | undefined =>
  ARCHETYPES.find(a => a.id === id);
