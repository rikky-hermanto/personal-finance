import { Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listSetups, InvestmentSetupDto } from '@/api/investmentApi';
import { ARCHETYPES } from '@/data/archetypes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

const AIReviewTab = () => {
  const navigate = useNavigate();
  const { data: setups = [], isLoading } = useQuery({
    queryKey: ['investment', 'setups'],
    queryFn: listSetups,
    staleTime: 60_000,
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  if (setups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-center">
        <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
          <Bot className="w-6 h-6 text-muted-foreground" />
        </div>
        <h2 className="text-base font-medium mb-1">No portfolios yet</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          Create a portfolio setup first, then run an AI review from here.
        </p>
        <Button size="sm" onClick={() => navigate('/investment/new')}>New setup</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <p className="text-sm text-muted-foreground mb-4">
          Select a portfolio to run or view an AI review.
        </p>
        <div className="grid gap-3">
          {setups.map((setup: InvestmentSetupDto) => {
            const arch = ARCHETYPES.find(a => a.id === setup.archetypeId);
            return (
              <Card
                key={setup.id}
                className="group cursor-pointer hover:border-foreground/20 transition-colors"
                onClick={() => navigate(`/investment/${setup.id}`)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: arch ? `${arch.color}15` : undefined }}
                  >
                    {arch?.glyph ?? '📊'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{setup.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {arch?.label ?? setup.archetypeId} · {setup.baseCurrency}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AIReviewTab;
