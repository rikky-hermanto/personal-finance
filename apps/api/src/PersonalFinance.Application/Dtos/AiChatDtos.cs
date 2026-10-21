using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PersonalFinance.Application.Dtos;

// PF-S15: chat requests keep the AI service's snake_case shape so the browser body is
// forwarded unchanged. The owner is never part of the body; it comes from ICurrentUser.

public sealed record AskChatRequest(
    [property: Required, StringLength(500, MinimumLength = 1), JsonPropertyName("query")] string Query,
    [property: JsonPropertyName("top_k")] int? TopK = null,
    [property: JsonPropertyName("category")] string? Category = null,
    [property: JsonPropertyName("account")] string? Account = null,
    [property: JsonPropertyName("date_from")] string? DateFrom = null,
    [property: JsonPropertyName("date_to")] string? DateTo = null);

public sealed record FollowUpChatContext(
    [property: JsonPropertyName("transaction_id")] int TransactionId,
    [property: JsonPropertyName("date")] string Date,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("amount_idr")] decimal AmountIdr,
    [property: JsonPropertyName("flow")] string Flow,
    [property: JsonPropertyName("wallet")] string Wallet);

public sealed record FollowUpChatRequest(
    [property: Required, StringLength(500, MinimumLength = 1), JsonPropertyName("question")] string Question,
    [property: Required, StringLength(4000, MinimumLength = 1), JsonPropertyName("answer")] string Answer,
    [property: JsonPropertyName("intent")] string? Intent = null,
    [property: JsonPropertyName("total_idr")] decimal? TotalIdr = null,
    [property: MaxLength(5), JsonPropertyName("contexts")] IReadOnlyList<FollowUpChatContext>? Contexts = null);

public sealed record AdvisorChatRequest(
    [property: Required, StringLength(1000, MinimumLength = 1), JsonPropertyName("query")] string Query,
    [property: StringLength(100), JsonPropertyName("session_id")] string? SessionId = null,
    [property: RegularExpression(@"^\d{4}-\d{2}-\d{2}$"), JsonPropertyName("date_from")] string? DateFrom = null,
    [property: RegularExpression(@"^\d{4}-\d{2}-\d{2}$"), JsonPropertyName("date_to")] string? DateTo = null);

public sealed record AdvisorChatResponse(
    [property: JsonPropertyName("answer")] string Answer,
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("steps_taken")] int StepsTaken);

/// <summary>The AI service failed or refused a chat call. Mapped to 502 without the upstream body (ERR-01).</summary>
public sealed class AiChatUnavailableException() : Exception("The AI chat service is unavailable.");

/// <summary>The AI service's input guard flagged the question (400 <c>input_flagged</c>). Mapped to 400, never 502.</summary>
public sealed class AiChatInputRejectedException() : Exception("The AI chat service rejected the question.");
