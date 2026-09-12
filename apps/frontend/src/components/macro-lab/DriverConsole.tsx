import { useState } from 'react';
import { ChevronDown, ChevronRight, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import DriverSlider from './DriverSlider';
import { DRIVER_GROUPS, PRESETS, type MacroDrivers } from '@/lib/macroScenario';
import type { SavedMacroScenario } from '@/types/MacroScenario';

interface DriverConsoleProps {
  drivers: MacroDrivers;
  onChange: (key: keyof MacroDrivers, value: number) => void;
  onLoadDrivers: (drivers: MacroDrivers) => void;
  savedScenarios: SavedMacroScenario[];
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  isSaving?: boolean;
}

const DriverConsole = ({ drivers, onChange, onLoadDrivers, savedScenarios, onSave, onDelete, isSaving }: DriverConsoleProps) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  return (
    <div className="sticky top-4 space-y-3">
      <div className="pf-card p-4 max-h-[calc(100vh-140px)] overflow-y-auto">
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
          Only exogenous drivers and policy choices can be moved here. Inflation, growth, unemployment,
          and the exchange rate are computed from these — they are results, not separate dials.
        </p>

        {DRIVER_GROUPS.map((group) => {
          const primary = group.items.filter((i) => i.tier === 'primary');
          if (primary.length === 0) return null;
          return (
            <div key={group.title} className="mb-4 last:mb-0">
              <div className="text-[11px] text-primary font-medium mb-2.5">{group.title}</div>
              {primary.map((item) => (
                <DriverSlider key={item.key} def={item} value={drivers[item.key]} onChange={(v) => onChange(item.key, v)} />
              ))}
            </div>
          );
        })}

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-3">
            {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Advanced settings ({DRIVER_GROUPS.reduce((n, g) => n + g.items.filter((i) => i.tier === 'advanced').length, 0)} more drivers)
          </CollapsibleTrigger>
          <CollapsibleContent>
            {DRIVER_GROUPS.map((group) => {
              const advanced = group.items.filter((i) => i.tier === 'advanced');
              if (advanced.length === 0) return null;
              return (
                <div key={group.title} className="mb-4 last:mb-0">
                  <div className="text-[11px] text-primary font-medium mb-2.5">{group.title}</div>
                  {advanced.map((item) => (
                    <DriverSlider key={item.key} def={item} value={drivers[item.key]} onChange={(v) => onChange(item.key, v)} />
                  ))}
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="pf-card p-3.5">
        <div className="text-xs text-muted-foreground mb-2">Load a historical scenario</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onLoadDrivers(p.drivers)}
              className="text-xs px-2.5 py-1.5 rounded border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pf-card p-3.5">
        <div className="text-xs text-muted-foreground mb-2">Saved scenarios</div>
        {savedScenarios.length > 0 && (
          <ul className="space-y-1 mb-2.5">
            {savedScenarios.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <button
                  onClick={() => onLoadDrivers(JSON.parse(s.driversJson))}
                  className="truncate text-foreground hover:text-primary transition-colors text-left"
                >
                  {s.name}
                </button>
                <button onClick={() => onDelete(s.id)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label={`Delete ${s.name}`}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-1.5">
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this scenario"
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            className="h-7 px-2.5"
            disabled={!saveName.trim() || isSaving}
            onClick={() => { onSave(saveName.trim()); setSaveName(''); }}
          >
            <Save className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DriverConsole;
