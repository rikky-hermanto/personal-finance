import { Slider } from '@/components/ui/slider';
import type { SliderDef } from '@/lib/macroScenario';

interface DriverSliderProps {
  def: SliderDef;
  value: number;
  onChange: (value: number) => void;
}

const DriverSlider = ({ def, value, onChange }: DriverSliderProps) => (
  <div className="mb-3.5">
    <div className="flex items-baseline justify-between mb-1">
      <span className="text-xs text-muted-foreground">{def.label}</span>
      <span className="font-data text-[13px] text-foreground tabular-nums">
        {value.toFixed(1)}
        <span className="text-muted-foreground text-[10.5px]">{def.unit}</span>
      </span>
    </div>
    <Slider
      min={def.min}
      max={def.max}
      step={def.step}
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      aria-label={def.label}
    />
  </div>
);

export default DriverSlider;
