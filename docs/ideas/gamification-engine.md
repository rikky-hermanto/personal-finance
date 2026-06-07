# Financial Journey Gamification Engine: Product Specification

## 1. Executive Summary
Traditional personal finance applications function as "digital accounting tools." While they provide data, they fail to motivate the consistency required for long-term wealth building. This specification outlines a paradigm shift: transforming the application into a **Dopamine-Driven Financial Journey**. 

By adopting a gamified "Hierarchy of Financial Needs," we shift the user's focus from mundane data entry to progressive leveling, emotional investment, and behavioral change. The core mechanic relies on a visual metaphor (a growing entity) that thrives on positive financial habits and visually withers upon poor decisions, thus creating a powerful behavioral loop.

---

## 2. The Core Framework: Hierarchy of Financial Needs
The application's logic is structured around a 5-tier pipeline. Users must master lower levels before upper levels become fully relevant.

*   **🌱 Level 1: Survival (Cashflow)**
    *   **Goal:** Establish a positive baseline. Income > Expenses.
    *   **Metrics for Graduation:** 3 consecutive months of positive net cashflow.
    *   **Features Unlocked/Highlighted:** Budgeting, Bill Tracking.
*   **🛡️ Level 2: Defense (Safety Net)**
    *   **Goal:** Protect against ruin.
    *   **Metrics for Graduation:** Emergency fund reaches 3x monthly expenses; 0% high-interest consumer debt (Paylater/Credit Card float).
    *   **Features Unlocked/Highlighted:** Debt Payoff Simulators, Insurance Tracker.
*   **📈 Level 3: Growth (Wealth Building)**
    *   **Goal:** Capital accumulation and goal funding.
    *   **Metrics for Graduation:** Consistent investment rate (e.g., 15% of income); funding mid-term life goals (house downpayment).
    *   **Features Unlocked/Highlighted:** Asset & Liability Balance Sheet, Investment Portfolios.
*   **🌴 Level 4: Freedom (Independence)**
    *   **Goal:** Passive income generation.
    *   **Metrics for Graduation:** Passive income streams cover >50% of monthly baseline expenses (FIRE trajectory).
    *   **Features Unlocked/Highlighted:** TWRR/IRR tracking, Retirement simulators, Dividend trackers.
*   **👑 Level 5: Legacy (Optimization)**
    *   **Goal:** Wealth distribution and absolute optimization.
    *   **Metrics:** Net worth hits defined targets.
    *   **Features Unlocked/Highlighted:** Tax optimization, Estate planning, Philanthropy tracking.

---

## 3. Theme Engine: "Grow Your Own"
During onboarding, users select a visual theme. This entity lives on their "My Journey" dashboard and visually represents their overall financial health and level.

### Theme A: The "Zen Forest" (Ecosystem)
*For users motivated by nature, calm, and organic growth.*
*   **L1:** A fragile seedling in soil. Good cashflow = water/sun. Negative cashflow = drooping/wilting.
*   **L2:** Deep roots grow; a protective glass dome appears (Emergency Fund).
*   **L3:** The tree grows massive branches and colorful leaves (Investments).
*   **L4:** The tree bears golden fruits continuously (Passive Income).
*   **L5:** The tree drops seeds, growing a surrounding lush forest (Legacy).

### Theme B: The "Metropolis" (City Builder)
*For users motivated by architecture, expansion, and tycoon mechanics.*
*   **L1:** A small village camp. Bad cashflow = dilapidated huts.
*   **L2:** City walls (Emergency Fund) and Hospitals (Insurance) are built.
*   **L3:** Skyscrapers, banks, and commercial districts emerge.
*   **L4:** Wind turbines and solar farms power the city autonomously.
*   **L5:** Grand monuments, universities, and parks are established.

### Theme C: The "Mineral Town Farm" (Harvest Moon)
*For users motivated by nostalgia, cozy management, and agricultural progression.*
*   **L1:** An inherited, messy field full of weeds and rocks. Good cashflow = clearing the field and watering your first turnip seeds. Bad cashflow = crops wither and weeds take over.
*   **L2:** Upgrading the chicken coop and building a sturdy fence (Emergency Fund) to protect from wild dogs (emergencies). Filling the silo before Winter.
*   **L3:** Buying cows and sheep (Assets) that take time to grow but produce high-value milk and wool. Upgrading tools to Gold/Mystrile for better leverage.
*   **L4:** Building the Greenhouse and hiring the Harvest Sprites (Automated/Passive Income). Crops grow and are harvested automatically without your active energy.
*   **L5:** Achieving the perfect 3-year evaluation from the Mayor, completing all farm extensions, and leaving a lasting legacy in the village.

---

## 4. Implementation Strategy & Plan

The transition to this gamified model will be executed in 4 distinct phases.

### Phase 1: Data Spine & Scoring Engine (Backend Focus)
Before altering the UI, we must establish the quantitative metrics that drive the gamification.
1.  **Gamification Schema:** Create a `user_gamification` table in Supabase.
    *   Fields: `user_id`, `current_level` (1-5), `total_score`, `selected_theme`, `current_streak`.
2.  **Scoring Algorithm Service:** Build a background worker (or .NET background service) that calculates the score nightly based on:
    *   *Cashflow Ratio* (Income / Expenses)
    *   *Liquidity Ratio* (Liquid Assets / Monthly Expenses -> Emergency Fund metric)
    *   *Debt-to-Income Ratio*
3.  **Event-Driven Triggers:** Implement CQRS domain events (e.g., `ExpenseLoggedEvent`, `AssetUpdatedEvent`) that recalculate the user's daily gamification state.

### Phase 2: The "Pipeline" Menu Redesign (Frontend Navigation)
Restructure the application's information architecture.
1.  **Sidebar Overhaul:** Replace functional menus (Transactions, Accounts) with Level-based menus (L1: Survival, L2: Defense, etc.).
2.  **Progressive Disclosure Logic:** 
    *   Implement logic where L4 and L5 menus show "Lock" icons if the user has not met L1/L2 graduation metrics.
    *   Move "boring" configuration (Ledgers, Bank Sync) to a secondary settings menu, keeping the main UI focused on the Journey.

### Phase 3: "My Journey" Dashboard UX (Frontend Visuals)
This is the core deliverable that the user interacts with daily.
1.  **Theme Renderer:** Implement a React component (potentially using `framer-motion` for 2D vectors or `three.js`/R3F for 3D) that renders the user's chosen theme (Tree, City, Rocket) based on their current Score and Level.
2.  **Dynamic AI Quests:** Replace static charts with actionable cards. 
    *   *Example:* AI detects low emergency fund -> generates Quest Card: *"Mission: Deposit Rp 500.000 to Savings to reinforce City Walls. Reward: +50 XP."*
3.  **Streak UI:** Build a habit-tracking visualization (like GitHub contributions) showing days where budget was respected.

### Phase 4: Advanced Behavioral Triggers (Polish)
1.  **Visual Consequences:** Implement "decay" animations. If a user logs a massive impulse purchase, the dashboard instantly shows the "Tree losing leaves" or the "City experiencing smog."
2.  **Badges & Milestones:** Unlockable achievements stored in the database (e.g., "The First 100M", "Debt Free", "Iron Discipline").
3.  **Push Notifications:** Send behavior-driven alerts (e.g., *"Your seedling is thirsty! Log your weekend expenses to keep it healthy."*).

---

## 5. Technical Architecture Impact

*   **Database:** Supabase will require new tables (`gamification_states`, `gamification_logs`, `user_achievements`).
*   **API (.NET):** New controllers for `Gamification` to fetch current state, active quests, and theme data. Integration with existing CQRS pipelines to emit state changes.
*   **AI (Python):** The AI service will analyze the user's financial posture and generate the "Dynamic Quests" (e.g., calculating exactly how much they need to save to reach the next level threshold).
*   **Frontend (React):** Requires heavily animated, state-driven components. The generic `DataTable` standard will be pushed to sub-pages, while the Dashboard becomes a highly customized visual experience.
