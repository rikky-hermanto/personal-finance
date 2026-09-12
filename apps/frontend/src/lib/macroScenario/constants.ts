// Macro Scenario Lab — model coefficients.
//
// Ported 1:1 from docs/reference/simulator-makro-v3.jsx (computeModel()). Every numeric literal
// from that file lives here, named, with a one-line note on what it represents (FIN-02: no magic
// thresholds). These are heuristic calibrations for an educational emerging-market macro model —
// NOT official Bank Indonesia, IMF, or OJK figures. Do not change a value without updating this
// comment and re-running the golden snapshot tests in __tests__/solver.test.ts.

// ── Core structural constants ──────────────────────────────────────────────
export const R_NEUTRAL = 2.2; // neutral real policy rate for an emerging market
export const OKUN = 0.45; // Okun's law coefficient (output gap → unemployment)
export const U_NAT = 5.0; // natural rate of unemployment, %
export const KAPPA = 0.42; // Phillips curve slope (output gap → inflation)
export const POTENTIAL_GROWTH_BASE = 3.4; // structural growth added on top of productivity growth

// ── FX crisis drag (feeds into the output-gap loop) ────────────────────────
export const FX_CRISIS_DRAG_IDR_THRESHOLD = 10; // % IDR depreciation beyond which crisis drag kicks in
export const FX_CRISIS_DRAG_DEBT_DIVISOR = 12; // scales FX-debt exposure into the drag term

// ── Output gap ───────────────────────────────────────────────────────────
export const OUTPUT_GAP_REAL_RATE_SENSITIVITY = -0.9; // real-rate gap vs R_NEUTRAL
export const OUTPUT_GAP_FISCAL_SENSITIVITY = 0.55; // fiscal deficit impulse
export const OUTPUT_GAP_FISCAL_NEUTRAL_DEFICIT = 2.5; // deficit level assumed fiscally neutral, % GDP
export const OUTPUT_GAP_EXTERNAL_DEMAND_SENSITIVITY = 0.30; // global growth impulse
export const OUTPUT_GAP_EXTERNAL_DEMAND_NEUTRAL = 3.0; // global growth assumed neutral, %
export const OUTPUT_GAP_COMMODITY_SENSITIVITY = 0.030; // export commodity terms-of-trade impulse
export const OUTPUT_GAP_OIL_SENSITIVITY = 0.020; // oil-price terms-of-trade drag (net importer)
export const OUTPUT_GAP_RISK_APPETITE_SENSITIVITY = 0.020; // global risk-on/off impulse
export const OUTPUT_GAP_DXY_SENSITIVITY = 0.030; // dollar-strength drag
export const RISK_APPETITE_NEUTRAL = 50; // midpoint of the 0-100 global risk-appetite index
export const TERMS_OF_TRADE_COMMODITY_WEIGHT = 0.045; // net terms-of-trade index used in the flow decomposition
export const TERMS_OF_TRADE_OIL_WEIGHT = 0.030; // net terms-of-trade index used in the flow decomposition

// ── Phillips curve / inflation ─────────────────────────────────────────────
export const IMPORTED_INFLATION_FX_PASSTHROUGH = 0.22; // IDR weakness → imported inflation
export const IMPORTED_INFLATION_OIL_PASSTHROUGH = 0.035; // oil price → imported inflation, net of subsidy
export const PHILLIPS_CURVE_OVERHEATING_STEEPENING = 0.08; // curve steepens once output gap turns positive
export const PHILLIPS_CURVE_ULC_PASSTHROUGH = 0.45; // unit labor cost gap vs expected inflation passthrough

// ── Capital flow decomposition (8 components, UI needs each raw value) ─────
export const FLOW_REAL_CARRY_WEIGHT = 4.0; // real interest-rate differential vs global
export const FLOW_GROWTH_DIFFERENTIAL_WEIGHT = 3.0; // domestic vs global growth differential
export const FLOW_RISK_APPETITE_WEIGHT = 0.8; // global risk-on/off sentiment
export const FLOW_DXY_WEIGHT = -2.2; // dollar strength drains EM flows
export const FLOW_TERMS_OF_TRADE_WEIGHT = 8; // net commodity/oil terms of trade
export const FLOW_RESERVES_WEIGHT = 2.0; // FX reserve adequacy vs comfortable level
export const RESERVES_ADEQUACY_MONTHS = 6; // months of import cover considered comfortable
export const FLOW_FX_DEBT_WEIGHT = -0.8; // corporate FX debt above the safe threshold repels flow
export const FX_DEBT_SAFE_THRESHOLD_PCT_GDP = 15; // corporate FX debt considered safe, % GDP
export const FLOW_NOMINAL_STABILITY_WEIGHT = -3.0; // inflation drifting far from target repels flow
export const NOMINAL_STABILITY_TOLERANCE_PP = 2; // inflation-vs-target gap tolerated before penalty, pp
export const FLOW_DEFLATION_PENALTY = 10; // extra flow penalty when inflation is negative

// ── FX (IDR) ─────────────────────────────────────────────────────────────
export const FX_BASE_DRIFT = -1.5; // baseline IDR drift absent any driver
export const FX_CAPITAL_FLOW_SENSITIVITY = 0.12; // capital flow score → IDR appreciation
export const FX_INFLATION_DIFFERENTIAL_SENSITIVITY = 0.5; // domestic vs global inflation differential
export const FX_DXY_SENSITIVITY = 0.35; // dollar strength → IDR depreciation
export const FX_RESERVES_SENSITIVITY = 0.6; // reserve buffer above/below comfortable level
export const FX_CLAMP_MIN = -60; // IDR move floor, %
export const FX_CLAMP_MAX = 25; // IDR move ceiling, %

// ── Labor market (results, not inputs) ──────────────────────────────────────
export const OKUN_INFORMALITY_DAMPENING = 0.6; // informal-sector share dampens formal layoffs
export const UNEMPLOYMENT_FLOOR = 1.2; // open unemployment can't fall below this, %
export const OKUN_ASYMMETRIC_DOWNTURN_BONUS = 0.10; // extra unemployment sensitivity on the downside
export const UNDEREMPLOYMENT_FLOOR = 4; // underemployment can't fall below this, %
export const UNDEREMPLOYMENT_BASE = 8; // baseline underemployment, %
export const UNDEREMPLOYMENT_INFORMALITY_WEIGHT = 22; // informal-sector share → underemployment
export const UNDEREMPLOYMENT_OUTPUT_GAP_WEIGHT = 1.9; // negative output gap → underemployment
export const JOB_GROWTH_OUTPUT_SENSITIVITY = 0.55; // GDP growth → job growth
export const JOB_GROWTH_BASE = -0.2; // job growth intercept

// ── Household-felt prices (also the DEFAULT weights used when a user's own
//    12-month spending mix isn't available yet — see personalization.ts) ───
export const FOOD_INFLATION_BASE_PREMIUM = 1.2; // food inflation runs above headline by default
export const FOOD_INFLATION_SHOCK_PASSTHROUGH = 1.5; // supply shock hits food first and hardest
export const FOOD_INFLATION_FX_PASSTHROUGH = 0.35; // IDR weakness → imported food/fertilizer cost
export const FOOD_INFLATION_OUTPUT_GAP_WEIGHT = 0.6; // demand pressure passthrough (× KAPPA)
export const FOOD_INFLATION_COMMODITY_WEIGHT = 0.02; // export commodity cycle spillover to food prices
export const FUEL_PRICE_OIL_PASSTHROUGH = 0.10; // Brent price → domestic fuel price, net of subsidy
export const FUEL_PRICE_FX_PASSTHROUGH = 0.30; // IDR weakness → imported fuel cost, net of subsidy
export const RENT_GROWTH_BASE = 2.0; // baseline rent growth, %
export const RENT_GROWTH_INFLATION_WEIGHT = 0.6; // headline inflation passthrough to rent
export const RENT_GROWTH_OUTPUT_GAP_WEIGHT = 0.4; // demand pressure on rents
export const RENT_GROWTH_REAL_RATE_WEIGHT = 0.25; // low/negative real rates inflate property demand
export const CPI_BOTTOM_FOOD_WEIGHT = 0.42; // bottom-40% household budget share — food (default)
export const CPI_BOTTOM_RENT_WEIGHT = 0.22; // bottom-40% household budget share — rent (default)
export const CPI_BOTTOM_FUEL_WEIGHT = 0.10; // bottom-40% household budget share — fuel (default)
export const CPI_BOTTOM_CORE_WEIGHT = 0.26; // bottom-40% household budget share — core/other (default)

// ── Instrument pricing (real IDR return per instrument) ────────────────────
export const INSTR_CASH_IDR_SPREAD = 0.75; // IDR deposit rate below the policy rate
export const INSTR_SBN_TERM_PREMIUM = 1.5; // 10Y government bond term premium over policy rate
export const INSTR_SBN_INFLATION_RISK_WEIGHT = 0.3; // inflation surprise → bond yield
export const INSTR_SBN_FLOW_WEIGHT = 0.03; // foreign flow → bond yield (inverse)
export const INSTR_SBN_DEBT_RISK_WEIGHT = 0.02; // fiscal risk premium once debt ratio is elevated
export const DEBT_RATIO_SAFE_THRESHOLD_PCT_GDP = 40; // government debt ratio considered safe, % GDP
export const INSTR_SBN_REAL_INFLATION_DRAG = 0.9; // inflation surprise drag on real bond return
export const INSTR_SBN_OUTFLOW_DRAG = 0.06; // capital outflow drag on real bond return
export const INSTR_IHSG_BASE_PREMIUM = 2.5; // IDX equity risk premium
export const INSTR_IHSG_NOMINAL_GROWTH_WEIGHT = 0.8; // nominal GDP growth → earnings growth
export const INSTR_IHSG_REAL_RATE_DRAG = 1.2; // real rates above comfort compress multiples
export const REAL_RATE_COMFORT_THRESHOLD = 2; // real policy rate considered comfortable for equities, %
export const INSTR_IHSG_VALUATION_GAP_DRAG = 1.0; // inflation off-target compresses the equity multiple
export const INSTR_IHSG_FLOW_WEIGHT = 0.12; // foreign flow → IDX return
export const INSTR_IHSG_COMMODITY_WEIGHT = 0.05; // commodity cycle → IDX earnings (heavy commodity index)
export const INSTR_IHSG_OIL_WEIGHT = 0.02; // oil price drag on IDX (net importer economy)
export const INSTR_IHSG_DEFLATION_PENALTY = 6; // extra IHSG hit under outright deflation
export const INSTR_PROPERTY_BASE_PREMIUM = 1.5; // property real-return premium
export const INSTR_PROPERTY_GROWTH_WEIGHT = 0.5; // GDP growth → property demand
export const INSTR_PROPERTY_RENT_WEIGHT = 0.75; // rent growth passthrough to property value
export const INSTR_PROPERTY_REAL_RATE_DRAG = 1.2; // real mortgage rates above zero compress valuations
export const INSTR_CASH_USD_SPREAD = 0.25; // USD deposit rate below Fed funds
export const INSTR_UST_TERM_PREMIUM = 1.2; // 10Y Treasury term premium over Fed funds
export const INSTR_UST_INFLATION_DRAG = 0.9; // US inflation above comfort drags real UST return
export const GLOBAL_INFLATION_COMFORT_THRESHOLD = 2; // developed-market inflation considered comfortable, %
export const INSTR_DM_EQUITY_BASE_PREMIUM = 3; // developed-market equity risk premium
export const INSTR_DM_EQUITY_NOMINAL_WEIGHT = 0.8; // nominal global inflation passthrough to earnings
export const INSTR_DM_EQUITY_REAL_RATE_DRAG = 1.2; // global real rates above comfort compress multiples
export const INSTR_DM_EQUITY_VALUATION_GAP_DRAG = 1.0; // inflation off-target compresses the multiple
export const INSTR_DM_EQUITY_RISK_APPETITE_WEIGHT = 0.10; // global risk sentiment
export const INSTR_GOLD_BASE_PREMIUM = 4; // gold real-return premium
export const INSTR_GOLD_REAL_RATE_DRAG = 2.2; // gold's defining relationship: inverse to global real rates
export const INSTR_GOLD_INFLATION_HEDGE_WEIGHT = 0.6; // gold benefits from inflation surprises
export const INSTR_GOLD_SAFE_HAVEN_WEIGHT = 0.10; // gold benefits when global risk appetite falls
export const INSTR_COMMODITY_EXPORT_WEIGHT = 0.55; // export commodity cycle passthrough
export const INSTR_COMMODITY_OIL_WEIGHT = 0.25; // oil price passthrough (energy is part of the basket)
export const INSTR_COMMODITY_GLOBAL_GROWTH_WEIGHT = 0.4; // global growth drives commodity demand
export const INSTR_CRYPTO_BASE_PREMIUM = 5; // crypto real-return premium
export const INSTR_CRYPTO_RISK_APPETITE_WEIGHT = 1.1; // crypto is the highest-beta risk-appetite asset
export const INSTR_CRYPTO_REAL_RATE_DRAG = 4.0; // crypto has no cash flow — hurts most from real rates
export const INSTR_CRYPTO_HIGH_INFLATION_THRESHOLD = 3; // global inflation level treated as "high" for crypto
export const INSTR_CRYPTO_HIGH_INFLATION_WEIGHT = 0.3; // debasement-hedge narrative benefit
export const INSTR_CRYPTO_GLOBAL_RECESSION_WEIGHT = 6; // crypto is hit hardest in a global growth contraction

// ── Sentiment (fear/greed) per instrument ───────────────────────────────────
export const SENTIMENT_NEUTRAL = 50; // midpoint of the 0-100 sentiment index
export const SENTIMENT_RETURN_WEIGHT = 1.6; // realized real return → sentiment
export const SENTIMENT_BETA_WEIGHT = 12; // instrument beta amplifies/dampens the risk-appetite swing
export const SENTIMENT_RISK_APPETITE_DIVISOR = 25; // normalizes the risk-appetite swing into the sentiment scale
export const CROWDED_SENTIMENT_THRESHOLD = 66; // sentiment above this + thin return = "crowded"
export const CROWDED_RETURN_THRESHOLD = 2; // real return below this + high sentiment = "crowded"
export const HATED_SENTIMENT_THRESHOLD = 34; // sentiment below this + fat return = "hated but cheap"
export const HATED_RETURN_THRESHOLD = 4; // real return above this + low sentiment = "hated but cheap"

// ── Default portfolio (fallback when a user has no mapped holdings yet) ────
export const DEFAULT_PORTFOLIO_WEIGHT_IHSG = 0.25;
export const DEFAULT_PORTFOLIO_WEIGHT_SBN = 0.25;
export const DEFAULT_PORTFOLIO_WEIGHT_DM_EQUITY = 0.15;
export const DEFAULT_PORTFOLIO_WEIGHT_CASH_IDR = 0.10;
export const DEFAULT_PORTFOLIO_WEIGHT_GOLD = 0.10;
export const DEFAULT_PORTFOLIO_WEIGHT_PROPERTY = 0.10;
export const DEFAULT_PORTFOLIO_WEIGHT_CRYPTO = 0.05;
export const INVESTOR_SCORE_SCALING = 9; // scales blended real portfolio return onto the -100..100 score

// ── Central bank ────────────────────────────────────────────────────────
export const FX_STRESS_IDR_THRESHOLD = 8; // IDR depreciation beyond which FX stress accrues, %
export const FX_STRESS_IDR_WEIGHT = 1.2;
export const FX_STRESS_RESERVES_WEIGHT = 6; // penalty per month of import cover below RESERVES_ADEQUACY_MONTHS
export const CB_SCORE_BASE = 100;
export const CB_SCORE_INFLATION_GAP_PENALTY = 3; // quadratic penalty weight on inflation-vs-target gap
export const CB_SCORE_OUTPUT_GAP_PENALTY = 1.5; // quadratic penalty weight on the output gap
export const CB_SCORE_ZERO_LOWER_BOUND_RATE = 1.5; // policy rate considered "stuck near zero", %
export const CB_SCORE_DEFLATION_TRAP_PENALTY = 25; // extra penalty: deflation + near-zero rates
export const CREDIBILITY_BASE = 100;
export const CREDIBILITY_EXPECTATION_GAP_PENALTY = 12; // expected vs target inflation gap
export const CREDIBILITY_FX_WEAKNESS_PENALTY = 0.6; // FX weakness erodes credibility
export const TAYLOR_INFLATION_GAP_WEIGHT = 1.5; // standard Taylor-rule inflation coefficient
export const TAYLOR_OUTPUT_GAP_WEIGHT = 0.5; // standard Taylor-rule output-gap coefficient

// ── Commercial banks ─────────────────────────────────────────────────────
export const BANK_COST_OF_FUNDS_SPREAD = 0.6;
export const BANK_COST_OF_FUNDS_OUTFLOW_WEIGHT = 0.15;
export const BANK_COST_OF_FUNDS_OUTFLOW_DIVISOR = 5;
export const BANK_NIM_FLOOR = 0.5; // %
export const BANK_NIM_CEILING = 8; // %
export const BANK_NIM_BASE = 2.0;
export const BANK_NIM_POLICY_RATE_WEIGHT = 0.22;
export const BANK_NIM_REAL_RATE_DRAG = 0.15;
export const BANK_NIM_REAL_RATE_COMFORT = 3; // real rate above which margin compresses, %
export const BANK_CREDIT_BASE = 2;
export const BANK_CREDIT_GROWTH_WEIGHT = 2.0;
export const BANK_CREDIT_REAL_RATE_DRAG = 1.0;
export const BANK_CREDIT_HIGH_INFLATION_THRESHOLD = 6; // %
export const BANK_CREDIT_HIGH_INFLATION_DRAG = 0.2;
export const BANK_CREDIT_FLOW_WEIGHT = 0.05;
export const BANK_CREDIT_CLAMP_MIN = -20;
export const BANK_CREDIT_CLAMP_MAX = 25;
export const NPL_FLOOR = 0.5; // %
export const NPL_CEILING = 30; // %
export const NPL_BASE = 2;
export const NPL_REAL_RATE_WEIGHT = 0.35;
export const NPL_REAL_RATE_COMFORT = 2; // real rate above which NPLs start rising, %
export const NPL_RECESSION_WEIGHT = 0.75;
export const NPL_UNEMPLOYMENT_GAP_WEIGHT = 0.5;
export const NPL_DEFLATION_WEIGHT = 2.5;
export const NPL_HIGH_INFLATION_THRESHOLD = 8; // %
export const NPL_HIGH_INFLATION_WEIGHT = 0.2;
export const NPL_WAGE_PRICE_GAP_WEIGHT = 0.4;
export const NPL_FX_DEBT_WEIGHT = 0.10;
export const NPL_FX_DEBT_DIVISOR = 12;
export const BANK_SCORE_NIM_WEIGHT = 5;
export const BANK_SCORE_NIM_COMFORT = 3; // NIM level treated as "normal", %
export const BANK_SCORE_CREDIT_WEIGHT = 2.2;
export const BANK_SCORE_NPL_WEIGHT = 7;
export const BANK_SCORE_NPL_COMFORT = 3; // NPL level treated as "normal", %
export const BANK_SCORE_INFLATION_GAP_PENALTY = 1.2;

// ── Corporates ───────────────────────────────────────────────────────────
export const CORP_LABOR_COST_WEIGHT = 0.55; // unit labor cost passthrough to total cost growth
export const CORP_IMPORT_COST_WEIGHT = 0.20;
export const CORP_IMPORT_OIL_WEIGHT = 0.35; // oil's share of imported input cost
export const CORP_RENT_COST_WEIGHT = 0.10;
export const CORP_CAPITAL_COST_WEIGHT = 0.10;
export const CORP_CAPITAL_COST_BASE_SPREAD = 3; // corporate borrowing spread over the real policy rate
export const CORP_FX_DEBT_HIT_WEIGHT = 0.35;
export const CORP_FX_DEBT_DIVISOR = 15;
export const CORP_COST_INFLATION_WEIGHT = 0.35; // general cost inflation passthrough
export const CORP_SCORE_GROWTH_WEIGHT = 4.5;
export const CORP_SCORE_MARGIN_WEIGHT = 2.0;
export const CORP_SCORE_REAL_RATE_DRAG = 2.0;
export const CORP_SCORE_REAL_RATE_COMFORT = 1; // real rate above which corporate score is hit, %
export const CORP_SCORE_INFLATION_GAP_PENALTY = 1.8;
export const CORP_SCORE_UNEMPLOYMENT_GAP_PENALTY = 2.0;
export const CORP_SCORE_DEFLATION_WEIGHT = 4; // extra penalty multiplier under deflation

// ── Government ───────────────────────────────────────────────────────────
export const GOV_SUBSIDY_BASE_COST_PCT_GDP = 0.9; // baseline energy subsidy cost, % GDP
export const GOV_SUBSIDY_OIL_WEIGHT = 0.022;
export const GOV_SUBSIDY_FX_WEIGHT = 0.03;
export const GOV_DEFICIT_OUTPUT_GAP_WEIGHT = 0.35; // automatic stabilizers narrow the deficit in a boom
export const GOV_SCORE_BASE = 30;
export const GOV_SCORE_DEFICIT_PENALTY = 12;
export const GOV_SCORE_DEFICIT_COMFORT_PCT_GDP = 3;
export const GOV_SCORE_DEBT_RATIO_PENALTY = 0.8;
export const GOV_SCORE_INTEREST_BURDEN_PENALTY = 14;
export const GOV_SCORE_INTEREST_BURDEN_COMFORT_PCT_GDP = 2.5;
export const GOV_SCORE_GROWTH_WEIGHT = 1.5;
export const GOV_SCORE_FX_WEAKNESS_PENALTY = 0.5;
export const GOV_SCORE_INFLATION_BENEFIT_WEIGHT = 0.6; // moderate inflation erodes old nominal debt — a benefit
export const GOV_SCORE_INFLATION_BENEFIT_CEILING = 8; // % — benefit capped before it becomes destabilizing
export const GOV_SCORE_RISING_DEBT_PENALTY = 6; // penalty when the debt ratio is still rising next year

// ── People ───────────────────────────────────────────────────────────────
export const PEOPLE_CONSUMER_LOAN_SPREAD = 3.5; // consumer/mortgage lending spread over the policy rate
export const PEOPLE_SCORE_WAGE_WEIGHT = 6;
export const PEOPLE_SCORE_UNEMPLOYMENT_WEIGHT = 5;
export const PEOPLE_SCORE_UNDEREMPLOYMENT_THRESHOLD = 21; // %
export const PEOPLE_SCORE_UNDEREMPLOYMENT_WEIGHT = 2.2;
export const PEOPLE_SCORE_REAL_RATE_WEIGHT = 1.2;
export const PEOPLE_SCORE_GROWTH_WEIGHT = 2;
export const PEOPLE_SCORE_RENT_BURDEN_WEIGHT = 1.5;
export const PEOPLE_SCORE_HYPERINFLATION_THRESHOLD = 10; // %
export const PEOPLE_SCORE_HYPERINFLATION_WEIGHT = 2.5;
export const PEOPLE_SCORE_DEFLATION_WEIGHT = 3.0;
export const PEOPLE_SCORE_DEPRESSION_PENALTY = 10; // extra penalty: deflation + contraction together

// ── Regime classification ──────────────────────────────────────────────────
export const REGIME_EXTREME_INFLATION_THRESHOLD = 15; // %
export const REGIME_LOW_GROWTH_THRESHOLD = 2; // %
export const REGIME_OVERHEATING_INFLATION_GAP_THRESHOLD = 2; // pp
export const REGIME_GOLDILOCKS_INFLATION_GAP_TOLERANCE = 1.5; // pp
export const REGIME_GOLDILOCKS_OUTPUT_GAP_TOLERANCE = 1; // pp below potential still counted as "at potential"
