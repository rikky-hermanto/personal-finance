import { useNavigate } from 'react-router-dom';
import { AlertCircle, Tag, RefreshCw } from 'lucide-react';

export interface CashflowQuest {
  id: string;
  label: string;
  count?: number;
  actionPath: string;
  icon: 'alert' | 'tag' | 'refresh';
}

const ICONS = {
  alert:   AlertCircle,
  tag:     Tag,
  refresh: RefreshCw,
};

interface Props {
  quests: CashflowQuest[];
}

export const CashflowQuestStrip = ({ quests }: Props) => {
  const navigate = useNavigate();

  if (!quests.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
      {quests.map(q => {
        const Icon = ICONS[q.icon];
        return (
          <button
            key={q.id}
            onClick={() => navigate(q.actionPath)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
          >
            <Icon className="h-3.5 w-3.5" />
            {q.label}
            {q.count !== undefined && (
              <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {q.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
