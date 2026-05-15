import { useTheme } from 'next-themes';
import { Moon, Sun, Maximize2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useFocusMode } from '@/lib/focus-mode';

const AppearanceTab = () => {
  const { theme, setTheme } = useTheme();
  const { focused, toggle } = useFocusMode();

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
            {/* Dark option */}
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

            {/* Light option */}
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

        {/* Divider */}
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
