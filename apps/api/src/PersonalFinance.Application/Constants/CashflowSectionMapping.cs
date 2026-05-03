using System.Collections.Generic;

namespace PersonalFinance.Application.Constants;

public enum CashflowSection
{
    OperatingIncome,
    OperatingExpense,
    Investing,
    Financing
}

public static class CashflowSectionMapping
{
    public static readonly Dictionary<string, CashflowSection> CategoryToSection = new(System.StringComparer.OrdinalIgnoreCase)
    {
        // OPERATING INCOME
        { "Salary", CashflowSection.OperatingIncome },
        { "Freelance", CashflowSection.OperatingIncome },
        { "Side Income", CashflowSection.OperatingIncome },
        { "Saving Interest", CashflowSection.OperatingIncome },
        { "Cashback", CashflowSection.OperatingIncome },
        { "Refund", CashflowSection.OperatingIncome },
        { "Bank Transfer", CashflowSection.OperatingIncome }, // CR case will be handled in service
        { "Gift", CashflowSection.OperatingIncome },         // CR case will be handled in service

        // OPERATING EXPENSE
        { "Food", CashflowSection.OperatingExpense },
        { "Food & Drinks", CashflowSection.OperatingExpense },
        { "Transport", CashflowSection.OperatingExpense },
        { "Bill", CashflowSection.OperatingExpense },
        { "Subscription", CashflowSection.OperatingExpense },
        { "Shopping", CashflowSection.OperatingExpense },
        { "Entertainment", CashflowSection.OperatingExpense },
        { "Health", CashflowSection.OperatingExpense },
        { "Education", CashflowSection.OperatingExpense },
        { "Vet and Dog", CashflowSection.OperatingExpense },
        { "Household", CashflowSection.OperatingExpense },
        { "Personal Care", CashflowSection.OperatingExpense },

        // INVESTING
        { "Stock", CashflowSection.Investing },
        { "Crypto", CashflowSection.Investing },
        { "Gold", CashflowSection.Investing },
        { "Property", CashflowSection.Investing },
        { "Mutual Fund", CashflowSection.Investing },
        { "Dividend", CashflowSection.Investing },
        { "Bond", CashflowSection.Investing },
        { "P2P Lending", CashflowSection.Investing },

        // FINANCING
        { "Loan", CashflowSection.Financing },
        { "Credit Card", CashflowSection.Financing },
        { "Withdrawing", CashflowSection.Financing },
        { "Insurance", CashflowSection.Financing }
    };
}
