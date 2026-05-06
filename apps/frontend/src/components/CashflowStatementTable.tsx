import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { CashflowStatement, StatementSection, StatementSubsection } from '@/types/CashflowStatement';

interface CashflowStatementTableProps {
  data: CashflowStatement | null;
  isLoading?: boolean;
}

const CashflowStatementTable = ({ data, isLoading }: CashflowStatementTableProps) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (isLoading) {
    return (
      <div className="w-full h-96 bg-card border border-border rounded-lg animate-pulse flex items-center justify-center">
        <div className="text-muted-foreground text-sm font-medium">Loading Statement...</div>
      </div>
    );
  }

  if (!data || data.periods.length === 0) {
    return (
      <div className="w-full h-48 bg-card border border-border rounded-lg flex items-center justify-center">
        <div className="text-muted-foreground text-sm">No data available for this range.</div>
      </div>
    );
  }

  const formatValue = (val: number) => {
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = formatCurrency(absVal).replace('Rp', '').trim();
    return isNegative ? `(${formatted})` : formatted;
  };

  return (
    <div className="w-full bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="sticky left-0 bg-card/95 backdrop-blur z-10 p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[240px]">
                Item (IDR)
              </th>
              {data.periods.map((period) => (
                <th key={period} className="p-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[120px]">
                  {period}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm font-mono tabular-nums">
            {data.sections.map((section) => (
              <React.Fragment key={section.id}>
                {/* Section Header */}
                <tr 
                  className="group cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors border-t border-border"
                  onClick={() => toggleCollapse(section.id)}
                >
                  <td className="sticky left-0 bg-muted/30 group-hover:bg-muted/50 z-10 p-3 flex items-center gap-2 font-bold text-foreground">
                    {collapsed[section.id] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {section.label}
                  </td>
                  {data.periods.map((p) => (
                    <td key={p} className="p-3 text-right font-bold text-foreground">
                      {/* Section total is usually not shown on the header row if it's just a grouping */}
                    </td>
                  ))}
                </tr>

                {!collapsed[section.id] && section.subsections.map((sub) => (
                  <React.Fragment key={sub.id}>
                    {/* Subsection Label */}
                    <tr className="bg-muted/5 border-b border-border/50">
                      <td className="sticky left-0 bg-card/95 backdrop-blur z-10 p-2 pl-8 font-medium text-muted-foreground italic text-xs">
                        {sub.label}
                      </td>
                      {data.periods.map((p) => (
                        <td key={p} className="p-2 text-right"></td>
                      ))}
                    </tr>

                    {/* Categories */}
                    {sub.categories.map((cat) => (
                      <tr key={cat.category} className="hover:bg-muted/10 transition-colors border-b border-border/30">
                        <td className="sticky left-0 bg-card/95 backdrop-blur z-10 p-2 pl-12 text-foreground/80">
                          {cat.category}
                        </td>
                        {data.periods.map((p) => {
                          const val = cat.values[p] || 0;
                          return (
                            <td 
                              key={p} 
                              className={cn(
                                "p-2 text-right text-xs font-mono",
                                val < 0 ? "text-expense/80" : "text-income/80"
                              )}
                            >
                              {formatValue(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {/* Subsection Total */}
                    <tr className="bg-muted/5 border-b border-border/50 font-semibold">
                      <td className="sticky left-0 bg-card/95 backdrop-blur z-10 p-2 pl-8 text-foreground/90">
                        Total {sub.label}
                      </td>
                      {data.periods.map((p) => {
                        const val = sub.totals[p] || 0;
                        return (
                          <td 
                            key={p} 
                            className={cn(
                              "p-2 text-right text-xs font-mono border-t border-border/30",
                              val < 0 ? "text-expense/80" : "text-income/80"
                            )}
                          >
                            {formatValue(val)}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                ))}

                {/* Section Summary Row (Net from section) */}
                {!collapsed[section.id] && (
                  <tr className="bg-muted/20 border-b border-border font-bold">
                    <td className="sticky left-0 bg-card/95 backdrop-blur z-10 p-3 pl-4 text-foreground">
                      Net {section.label.split(' ')[0].charAt(0).toUpperCase() + section.label.split(' ')[0].slice(1).toLowerCase()}
                    </td>
                    {data.periods.map((p) => {
                      const val = section.totals[p] || 0;
                      return (
                        <td 
                          key={p} 
                          className={cn(
                            "p-3 text-right text-sm font-mono",
                            val < 0 ? "text-expense" : "text-income"
                          )}
                        >
                          {formatValue(val)}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </React.Fragment>
            ))}

            {/* Grand Total Row */}
            <tr className="bg-muted/40 border-t-2 border-foreground/30 font-bold">
              <td className="sticky left-0 bg-card/95 backdrop-blur z-10 p-4 text-foreground uppercase tracking-tight">
                Net Cash Change
              </td>
              {data.periods.map((p) => {
                const val = data.grandTotals[p] || 0;
                return (
                  <td 
                    key={p} 
                    className={cn(
                      "p-4 text-right text-sm font-mono",
                      val < 0 ? "text-expense" : "text-income underline decoration-double underline-offset-4"
                    )}
                  >
                    {formatValue(val)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CashflowStatementTable;
