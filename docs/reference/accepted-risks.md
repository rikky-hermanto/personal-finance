# Accepted risks

Findings the owner has decided to live with, recorded so they are a conscious choice and not an oversight. Add one row per accepted item; keep names, credentials and other sensitive values out of this file.

| Finding | Decision | Date | Reason |
|---------|----------|------|--------|
| Real names in the public category-rules export (`docs/data/category-rules-2026-05-07.csv`, plus two PF-107 docs), present in git history since commit `c77208a7` | Current tree scrubbed in PF-143. History is not rewritten and nothing is force-pushed. The copies in old commits stay exposed and that is accepted. | 2026-10-22 | Owner decision under E-001: a history rewrite plus force-push breaks every clone and open branch. |
