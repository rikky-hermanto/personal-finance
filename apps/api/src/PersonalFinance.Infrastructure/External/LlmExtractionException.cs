namespace PersonalFinance.Infrastructure.External;

public class LlmExtractionException : Exception
{
    public bool IsTransient { get; }

    public LlmExtractionException(string message, bool isTransient = false) : base(message)
        => IsTransient = isTransient;

    public LlmExtractionException(string message, Exception inner) : base(message, inner) { }
}
