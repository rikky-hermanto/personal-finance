export interface CashflowStatementCategory {
  category: string;
  values: Record<string, number>;
}

export interface StatementSubsection {
  id: string;
  label: string;
  categories: CashflowStatementCategory[];
  totals: Record<string, number>;
}

export interface StatementSection {
  id: string;
  label: string;
  subsections: StatementSubsection[];
  totals: Record<string, number>;
}

export interface CashflowStatement {
  periods: string[];
  sections: StatementSection[];
  grandTotals: Record<string, number>;
}
