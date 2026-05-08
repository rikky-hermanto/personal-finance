using System;
using System.Globalization;

public static class CsvAmountParser
{
    public static decimal Parse(string? amountString)
    {
        if (string.IsNullOrWhiteSpace(amountString))
            return 0;

        // Remove currency symbols and formatting
        var cleaned = amountString
            .Replace("Rp", "", StringComparison.OrdinalIgnoreCase)
            .Replace("IDR", "", StringComparison.OrdinalIgnoreCase)
            .Replace("$", "")
            .Replace("€", "")
            .Replace("£", "")
            .Replace(" ", "")
            .Trim();

        // Handle negative amounts in parentheses
        if (cleaned.StartsWith("(") && cleaned.EndsWith(")"))
        {
            cleaned = "-" + cleaned.Substring(1, cleaned.Length - 2);
        }

        // Handle comma as decimal separator
        if (cleaned.Contains(',') && cleaned.Contains('.'))
        {
            // European format: 1.234,56
            var lastCommaIndex = cleaned.LastIndexOf(',');
            var lastDotIndex = cleaned.LastIndexOf('.');

            if (lastCommaIndex > lastDotIndex)
            {
                cleaned = cleaned.Replace(".", "").Replace(",", ".");
            }
            else
            {
                cleaned = cleaned.Replace(",", "");
            }
        }
        else if (cleaned.Contains(','))
        {
            // Could be thousands separator or decimal separator
            var commaIndex = cleaned.LastIndexOf(',');
            if (cleaned.Length - commaIndex == 4) // Exactly 3 digits after comma → thousands separator (e.g. "1,000")
            {
                cleaned = cleaned.Replace(",", "");
            }
            else // 2 or fewer digits after comma → decimal separator (e.g. "931,51" or "20101059,26")
            {
                cleaned = cleaned.Replace(",", ".");
            }
        }

        if (decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out var amount))
        {
            return Math.Abs(amount);
        }

        throw new FormatException($"Unable to parse amount: {amountString}");
    }

    public static bool TryParse(string? amountString, out decimal amount)
    {
        try
        {
            amount = Parse(amountString);
            return true;
        }
        catch (FormatException)
        {
            amount = 0;
            return false;
        }
    }
}
