import { useTheme } from 'next-themes';
import { Moon, Sun, Maximize2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useFocusMode } from '@/lib/focus-mode';
import { useJourneyStyle, JOURNEY_STYLE_OPTIONS, type JourneyStyle } from '@/hooks/useJourneyStyle';

// ── Mini preview SVGs for each journey style ──────────────────────────────────

const TreePreview = () => (
  <svg viewBox="0 0 64 72" className="w-full h-full">
    {/* Ground */}
    <ellipse cx="32" cy="62" rx="16" ry="3" fill="rgb(196 218 190)" />
    {/* Trunk */}
    <rect x="29" y="38" width="6" height="24" fill="rgb(180 190 200)" rx="1" />
    {/* Canopy layers */}
    <ellipse cx="20" cy="38" rx="10" ry="8"  fill="rgb(226 232 240)" />
    <ellipse cx="44" cy="38" rx="10" ry="8"  fill="rgb(226 232 240)" />
    <ellipse cx="32" cy="44" rx="12" ry="7"  fill="rgb(226 232 240)" />
    <ellipse cx="32" cy="28" rx="14" ry="10" fill="rgb(226 232 240)" />
    <ellipse cx="32" cy="16" rx="10" ry="9"  fill="rgb(226 232 240)" />
  </svg>
);

const SkylinePreview = () => (
  <svg viewBox="0 0 64 56" className="w-full h-full">
    {/* Ground */}
    <rect x="0" y="50" width="64" height="6" fill="rgb(196 218 190)" />
    {/* L5 center tower */}
    <rect x="27" y="10" width="10" height="40" fill="rgb(226 232 240)" rx="0.5" />
    <line x1="32" y1="10" x2="32" y2="4" stroke="rgb(210 220 230)" strokeWidth="1.5" />
    {/* L4 twin towers */}
    <rect x="12" y="20" width="12" height="30" fill="rgb(226 232 240)" rx="0.5" />
    <rect x="40" y="20" width="12" height="30" fill="rgb(226 232 240)" rx="0.5" />
    {/* L3 mid */}
    <rect x="2"  y="30" width="8"  height="20" fill="rgb(226 232 240)" rx="0.5" />
    <rect x="54" y="30" width="8"  height="20" fill="rgb(226 232 240)" rx="0.5" />
    {/* L1/L2 small */}
    <rect x="22" y="40" width="5"  height="10" fill="rgb(226 232 240)" rx="0.5" />
    <rect x="37" y="40" width="5"  height="10" fill="rgb(226 232 240)" rx="0.5" />
  </svg>
);

const CrystalPreview = () => (
  <svg viewBox="0 0 64 80" className="w-full h-full">
    {/* Diamond gem */}
    <polygon points="12,30 52,30 58,44 32,72 6,44" fill="rgb(226 232 240)" />
    <polygon points="20,10 44,10 52,30 12,30" fill="rgb(226 232 240)" />
    {/* Facet lines */}
    <line x1="20" y1="10" x2="6"  y2="44" stroke="white" strokeWidth="0.8" opacity="0.6" />
    <line x1="44" y1="10" x2="58" y2="44" stroke="white" strokeWidth="0.8" opacity="0.6" />
    <line x1="32" y1="10" x2="6"  y2="44" stroke="white" strokeWidth="0.8" opacity="0.4" />
    <line x1="32" y1="10" x2="58" y2="44" stroke="white" strokeWidth="0.8" opacity="0.4" />
    <line x1="32" y1="30" x2="32" y2="72" stroke="white" strokeWidth="0.8" opacity="0.35" />
  </svg>
);

const STYLE_PREVIEWS: Record<JourneyStyle, React.ReactNode> = {
  tree:    <TreePreview />,
  skyline: <SkylinePreview />,
  crystal: <CrystalPreview />,
};

// ─────────────────────────────────────────────────────────────────────────────

const AppearanceTab = () => {
  const { theme, setTheme } = useTheme();
  const { focused, toggle } = useFocusMode();
  const { style: journeyStyle, setStyle: setJourneyStyle } = useJourneyStyle();

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Page heading */}
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Appearance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customize how the app looks and feels.
          </p>
        </div>

        {/* Theme section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Theme</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dark keeps the current Toloshi palette. Light switches to the warm zen canvas.
            </p>
          </div>

          <RadioGroup
            value={theme}
            onValueChange={setTheme}
            className="grid grid-cols-2 gap-3 max-w-sm"
          >
            <Label
              htmlFor="theme-dark"
              className={cn(
                'flex flex-col items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150',
                'bg-card hover:border-foreground/30',
                theme === 'dark' ? 'border-foreground/40 ring-1 ring-foreground/20' : 'border-border'
              )}
            >
              <RadioGroupItem value="dark" id="theme-dark" className="sr-only" />
              <div className="w-10 h-10 rounded-lg bg-[#08080a] border border-white/10 flex items-center justify-center">
                <Moon className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs font-medium text-foreground">Dark</span>
            </Label>

            <Label
              htmlFor="theme-light"
              className={cn(
                'flex flex-col items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150',
                'bg-card hover:border-foreground/30',
                theme === 'light' ? 'border-foreground/40 ring-1 ring-foreground/20' : 'border-border'
              )}
            >
              <RadioGroupItem value="light" id="theme-light" className="sr-only" />
              <div className="w-10 h-10 rounded-lg bg-[#F5F3EE] border border-black/10 flex items-center justify-center">
                <Sun className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs font-medium text-foreground">Light</span>
            </Label>
          </RadioGroup>
        </section>

        <div className="border-t border-border" />

        {/* Journey Visualization section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Journey Visualization</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              How your financial progress pyramid is displayed on the Journey page.
            </p>
          </div>

          <RadioGroup
            value={journeyStyle}
            onValueChange={(v) => setJourneyStyle(v as JourneyStyle)}
            className="grid grid-cols-3 gap-3"
          >
            {JOURNEY_STYLE_OPTIONS.map((opt) => (
              <Label
                key={opt.id}
                htmlFor={`journey-style-${opt.id}`}
                className={cn(
                  'flex flex-col items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150',
                  'bg-card hover:border-foreground/30',
                  journeyStyle === opt.id
                    ? 'border-foreground/40 ring-1 ring-foreground/20'
                    : 'border-border'
                )}
              >
                <RadioGroupItem value={opt.id} id={`journey-style-${opt.id}`} className="sr-only" />
                <div className="w-14 h-14 flex items-center justify-center">
                  {STYLE_PREVIEWS[opt.id]}
                </div>
                <div className="text-center space-y-0.5">
                  <div className="text-xs font-medium text-foreground">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </section>

        <div className="border-t border-border" />

        {/* Focus mode section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Focus mode</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recesses the sidebar and activity panel so the active feature takes the full stage.
              Best combined with the Light theme.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card max-w-sm">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                focused ? 'bg-foreground text-background' : 'bg-foreground/5 text-muted-foreground'
              )}>
                <Maximize2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-medium text-foreground">
                  {focused ? 'Active' : 'Inactive'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  ⌘. to toggle anywhere
                </div>
              </div>
            </div>
            <Switch
              id="focus-mode"
              checked={focused}
              onCheckedChange={toggle}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default AppearanceTab;
