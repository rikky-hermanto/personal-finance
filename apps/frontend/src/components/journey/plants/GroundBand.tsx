import { cn } from '@/lib/utils';

interface LevelMeta {
  key: string;
  label: string;
  score: number;
  isActive: boolean;
  isGraduated: boolean;
}

interface GroundBandProps {
  levels: LevelMeta[];
}

export const GroundBand = ({ levels }: GroundBandProps) => (
  <div className="w-full">
    <div
      className="w-full h-7 rounded-sm"
      style={{ background: 'linear-gradient(to bottom, #FAF7F0, #E8DFC8)' }}
    />
    <div className="grid grid-cols-5 mt-2">
      {levels.map((lv) => (
        <div key={lv.key} className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">{lv.key}</span>
          <span className="text-[10px] text-muted-foreground/70">{lv.label}</span>
          <div className={cn(
            'flex items-center gap-0.5 text-[9px] mt-0.5',
            lv.isGraduated ? 'text-emerald-600' : lv.isActive ? 'text-amber-600' : 'text-muted-foreground/50',
          )}>
            <span>{lv.isGraduated ? '●' : lv.isActive ? '◐' : '○'}</span>
            <span>{lv.score.toFixed(0)}/100</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);
