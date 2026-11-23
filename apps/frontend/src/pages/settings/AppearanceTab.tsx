import { useTheme } from 'next-themes';
import { Moon, Sun, Maximize2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useFocusMode } from '@/lib/focus-mode';
import { useJourneyStyle, JOURNEY_STYLE_OPTIONS, type JourneyStyle } from '@/hooks/useJourneyStyle';

// ── Preview: frame 0 of each species' full-grown (stage 3) sprite sheet, at 1x ──────────────
// Written out as whole literal strings, because Tailwind only generates classes it can find whole.
const STYLE_PREVIEW_CLASS: Record<JourneyStyle, string> = {
  cherry: "bg-[url('/garden/l3-stage-3.png')]",
  bush:   "bg-[url('/garden/l1-stage-3.png')]",
  maple:  "bg-[url('/garden/l4-stage-3.png')]",
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
              The tree that grows with your progress on the Journey page.
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
                <span
                  aria-hidden="true"
                  className={cn(
                    'block h-24 w-24 bg-no-repeat bg-[length:768px_96px] bg-[position:0_0] [image-rendering:pixelated]',
                    STYLE_PREVIEW_CLASS[opt.id],
                  )}
                />
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
