// Build-time flags. VITE_* values are baked in at build time and must never hold a secret.

/** PF-S15: AI chat reads only the signed-in user's data through /api/chat. Off unless set to 'true'. */
export const AI_CHAT_ENABLED = import.meta.env.VITE_AI_CHAT_ENABLED === 'true';
