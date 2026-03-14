
import { Transaction } from '@/types/Transaction';

// Simulated parsing function - in real app this would parse actual CSV/PDF files
export const parseTransactionFiles = (files: File[]): Promise<Transaction[]> => {
  return new Promise((resolve) => {
    // Simulate parsing delay
    setTimeout(() => {
      const mockTransactions: Transaction[] = [
        {
          id: `parsed-${Date.now()}-1`,
          date: '2024-01-15',
          description: 'Transfer from Salary Account',
          amount: 15000000,
          type: 'income',
          category: 'Income',
          bank: files[0]?.name.includes('bca') ? 'BCA' : 'NeoBank'
        },
        {
          id: `parsed-${Date.now()}-2`,
          date: '2024-01-16',
          description: 'McDonald\'s Restaurant Payment',
          amount: 85000,
          type: 'expense',
          category: 'Food & Dining',
          bank: files[0]?.name.includes('bca') ? 'BCA' : 'NeoBank'
        },
        {
          id: `parsed-${Date.now()}-3`,
          date: '2024-01-17',
          description: 'Grab Transportation Service',
          amount: 35000,
          type: 'expense',
          category: 'Transportation',
          bank: files[0]?.name.includes('bca') ? 'BCA' : 'NeoBank'
        },
        {
          id: `parsed-${Date.now()}-4`,
          date: '2024-01-18',
          description: 'Indomaret Grocery Shopping',
          amount: 125000,
          type: 'expense',
          category: 'Groceries',
          bank: files[0]?.name.includes('bca') ? 'BCA' : 'NeoBank'
        },
        {
          id: `parsed-${Date.now()}-5`,
          date: '2024-01-19',
          description: 'Netflix Monthly Subscription',
          amount: 159000,
          type: 'expense',
          category: 'Entertainment',
          bank: files[0]?.name.includes('bca') ? 'BCA' : 'NeoBank'
        }
      ];

      // Add more transactions based on number of files
      if (files.length > 1) {
        mockTransactions.push(
          {
            id: `parsed-${Date.now()}-6`,
            date: '2024-01-20',
            description: 'PLN Electricity Bill Payment',
            amount: 250000,
            type: 'expense',
            category: 'Bills & Utilities',
            bank: 'Wise'
          },
          {
            id: `parsed-${Date.now()}-7`,
            date: '2024-01-21',
            description: 'Freelance Project Payment',
            amount: 5000000,
            type: 'income',
            category: 'Income',
            bank: 'Wise'
          }
        );
      }

      resolve(mockTransactions);
    }, 1500);
  });
};

// Auto-categorization function using keywords
export const categorizTransaction = (description: string): string => {
  const categoryRules = [
    { keywords: ['mcdonald', 'kfc', 'restaurant', 'cafe', 'food'], category: 'Food & Dining' },
    { keywords: ['grab', 'gojek', 'taxi', 'transport', 'uber'], category: 'Transportation' },
    { keywords: ['indomaret', 'alfamart', 'supermarket', 'grocery'], category: 'Groceries' },
    { keywords: ['netflix', 'spotify', 'cinema', 'movie', 'entertainment'], category: 'Entertainment' },
    { keywords: ['pln', 'electricity', 'water', 'gas', 'utility', 'bill'], category: 'Bills & Utilities' },
    { keywords: ['salary', 'transfer', 'freelance', 'payment', 'income'], category: 'Income' },
    { keywords: ['shopping', 'mall', 'store', 'purchase'], category: 'Shopping' },
    { keywords: ['hospital', 'doctor', 'pharmacy', 'medical'], category: 'Healthcare' },
    { keywords: ['school', 'course', 'education', 'tuition'], category: 'Education' },
    { keywords: ['gas', 'fuel', 'petrol', 'gasoline'], category: 'Gas & Fuel' },
  ];

  const lowerDesc = description.toLowerCase();
  
  for (const rule of categoryRules) {
    if (rule.keywords.some(keyword => lowerDesc.includes(keyword))) {
      return rule.category;
    }
  }
  
  return 'Other';
};
