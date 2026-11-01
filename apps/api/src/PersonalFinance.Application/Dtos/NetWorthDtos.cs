namespace PersonalFinance.Application.Dtos;

/// <summary>Current balance sheet totals in IDR. NetWorthIdr = AssetsIdr − LiabilitiesIdr.</summary>
public record NetWorthSummaryDto(decimal NetWorthIdr, decimal AssetsIdr, decimal LiabilitiesIdr, decimal LiquidIdr);

/// <summary>Balance sheet totals at the end of one day that has at least one valuation.</summary>
public record NetWorthPointDto(DateTime Date, decimal ValueIdr, decimal AssetsIdr, decimal LiabilitiesIdr);
