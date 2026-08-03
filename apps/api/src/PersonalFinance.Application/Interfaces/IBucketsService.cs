using PersonalFinance.Application.Dtos.Buckets;

public interface IBucketsService
{
    Task<BucketsResponseDto> GetBucketsAsync();
    Task<MonthCloseDto> GetMonthCloseAsync();
    Task<BucketsResponseDto> SetFuturePlanAsync(decimal futureMonthlyAmount);
    Task<BucketsResponseDto> DemoteCommittedItemAsync(string itemKey);
}
