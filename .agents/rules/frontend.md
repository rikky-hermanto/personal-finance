# Codex frontend rules

Scope: `apps/frontend/**`. Read frontend AGENTS.md and the Zen skill for UI/UX work.
Zen is the project default; the base data-oriented-theme is available for explicit
base-theme requests and shared principles, not a competing automatic redesign.

Use React functional components, source imports through @/, typed plain-fetch clients
in src/api, React Query for server state, local state for interactions, and existing
react-hook-form/Zod patterns. Keep standard UI primitives managed by shadcn; do not
manually edit src/components/ui. Reuse lucide-react, Recharts, Tailwind, and cn().

Preserve theme variables and dark mode. Prefer meaningful types to any; current app
strictness is not fully enabled, so report reality rather than claiming strict mode.
Place shared types in src/types and response shapes beside clients as appropriate.
Follow local filenames instead of mechanically renaming existing hooks.

Use the datatable skill for server-paginated/filterable data tables. Keep loading,
empty, partial, error, and unevaluated states distinct. Check keyboard/touch access,
focus, labels, layout responsiveness, and monetary units. Preserve readable temporal
labels such as Last Month instead of ambiguous abbreviations.

Vitest desk/macro suites and Playwright E2E already exist. Test observable behavior,
run affected suites, and report backend prerequisites. Do not add testing libraries
or a duplicate table implementation without checking current components first.
