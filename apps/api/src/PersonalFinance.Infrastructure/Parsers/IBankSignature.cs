namespace PersonalFinance.Infrastructure.Parsers;

/// <summary>
/// A single bank's detection rule. Implementations live in Parsers/Signatures/.
/// </summary>
public interface IBankSignature
{
    /// <summary>Returns the BankKeys constant this signature identifies.</summary>
    string BankKey { get; }

    /// <summary>Returns true if this signature is applicable to the given content type.</summary>
    bool AppliesTo(string contentType);

    /// <summary>Returns true if the probed content matches this bank's fingerprint.</summary>
    bool Matches(BankProbeContext ctx);
}
