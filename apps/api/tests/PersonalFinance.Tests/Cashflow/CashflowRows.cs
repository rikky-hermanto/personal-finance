using System.Text.Json;
using PersonalFinance.Tests.Support;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// JSON rows shaped like PostgREST's answer for the transactions table and its balance view.
/// Dates carry the "+00:00" offset a timestamptz column comes back with. Fixture rows sit at
/// midnight UTC, which is what the import pipeline stores for a statement date.
/// </summary>
internal static class CashflowRows
{
    public static object Tx(
        int id, DateTime day, string type, string category, decimal amountIdr,
        string description = "row", string currency = "IDR", decimal? exchangeRate = null,
        Guid? accountId = null, decimal? statementBalance = null, string? flow = null,
        decimal? runningBalance = null, string time = "00:00:00") => new
    {
        id,
        user_id = TestCaller.Id,
        date = $"{day:yyyy-MM-dd}T{time}+00:00",
        description,
        remarks = "",
        flow = flow ?? (type == "Income" ? "CR" : "DB"),
        type,
        category,
        account_id = accountId,
        amount_idr = amountIdr,
        currency,
        exchange_rate = exchangeRate,
        statement_balance = statementBalance,
        running_balance = runningBalance,
    };

    public static object Account(Guid id, string name, Guid? institutionId = null) => new
    {
        id,
        user_id = TestCaller.Id,
        institution_id = institutionId,
        name,
        account_type = "checking",
        currency = "IDR",
        opening_balance = 0m,
        is_active = true,
        include_in_cashflow = true,
    };

    public static string Json(params object[] rows) => JsonSerializer.Serialize(rows);

    public static string Json(IEnumerable<object> rows) => JsonSerializer.Serialize(rows);

    /// <summary>The query string with percent-escapes decoded, for readable assertions.</summary>
    public static string Query(RecordedRequest request) => Uri.UnescapeDataString(request.Query);

    public const string ServerError = """{"code":"XX000","message":"LEAK-MARKER internal detail"}""";
}
