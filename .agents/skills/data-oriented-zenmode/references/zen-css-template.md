# Zen CSS and token guidance

For the application, map the design to existing `src/index.css` variables and
Tailwind classes. Do not paste a second global reset or light-only `:root` palette
over the application's theme system. New standalone artifacts can use these tokens:

```css
.zen-artifact {
  --zen-bg: #F5F3EE;
  --zen-surface: #FFFFFF;
  --zen-elevated: #FAF9F7;
  --zen-border: #E8E5DF;
  --zen-border-hi: #D4D0C8;
  --zen-tx-1: #37352F;
  --zen-tx-2: #6B6B6B;
  --zen-cta: #E8C5A8;
  --zen-cta-text: #5C3D1E;
  --font-title: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  background-color: var(--zen-bg);
  color: var(--zen-tx-1);
  background-image:
    linear-gradient(rgba(0,0,0,.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,.018) 1px, transparent 1px);
  background-size: 80px 80px;
}

.zen-stage {
  width: 100%;
  max-width: 1024px;
  margin-inline: auto;
  padding: max(8vh, 48px) 24px 48px;
  box-sizing: border-box;
}
.zen-stage--table { max-width: 1440px; }
.zen-stage--dashboard { width: 95%; max-width: 1728px; }
.zen-title { font-family: var(--font-title); font-weight: 600; letter-spacing: -.02em; }
.zen-surface {
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: 12px;
  padding: 16px 20px;
}
.zen-artifact :focus-visible {
  outline: 2px solid var(--zen-tx-1);
  outline-offset: 3px;
}
.zen-reveal { animation: zen-reveal 300ms cubic-bezier(.16,1,.3,1); }
@keyframes zen-reveal {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 768px) {
  .zen-stage { padding: max(4vh, 24px) 16px 32px; }
}
@media (max-width: 480px) {
  .zen-artifact { background-image: none; }
}
@media (prefers-reduced-motion: reduce) {
  .zen-reveal { animation: none; }
}
```

Use semantic application tokens such as `bg-background`, `bg-card`,
`text-muted-foreground`, `border-border`, `text-income`, and `text-expense` for
application components. Verify available tokens in the current theme configuration.
The example light values require a separate dark treatment for a standalone artifact
that supports dark mode.

Primary inputs can use `0 1px 3px rgba(0,0,0,.04)`; floating action pills can use
`0 4px 16px rgba(0,0,0,.06)`. Cards remain shadowless. Keep essential navigation
visible with full pointer/keyboard access; use muted colors rather than opacity-zero
hover zones.
