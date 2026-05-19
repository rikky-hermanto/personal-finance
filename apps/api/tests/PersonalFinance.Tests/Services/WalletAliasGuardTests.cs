using MediatR;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace PersonalFinance.Tests.Services;

/// <summary>
/// Tests for the guard-clause paths in TransactionService.ResolveAliasAsync and UpsertAliasAsync.
/// Both methods return early (before touching Supabase) when input is null/whitespace,
/// so Supabase.Client is passed as null! — these are pure guard tests.
/// </summary>
public class WalletAliasGuardTests
{
    private static TransactionService BuildService() =>
        new(null!, Mock.Of<IMediator>(), Mock.Of<ILogger<TransactionService>>());

    // ── ResolveAliasAsync ─────────────────────────────────────────────────────

    [Fact]
    public async Task ResolveAliasAsync_NullInput_ReturnsNullWithoutDbCall()
    {
        // Arrange
        var service = BuildService();

        // Act — Supabase.Client is null; if the guard fails it will throw NullReferenceException
        var result = await service.ResolveAliasAsync(null!);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task ResolveAliasAsync_EmptyString_ReturnsNullWithoutDbCall()
    {
        var service = BuildService();

        var result = await service.ResolveAliasAsync(string.Empty);

        Assert.Null(result);
    }

    [Fact]
    public async Task ResolveAliasAsync_WhitespaceOnly_ReturnsNullWithoutDbCall()
    {
        var service = BuildService();

        var result = await service.ResolveAliasAsync("   ");

        Assert.Null(result);
    }

    // ── ResolveAliasesBatchAsync ──────────────────────────────────────────────

    [Fact]
    public async Task ResolveAliasesBatchAsync_EmptyEnumerable_ReturnsEmptyDictWithoutDbCall()
    {
        // Supabase.Client is null — if the guard fails it throws NullReferenceException
        var service = BuildService();

        var result = await service.ResolveAliasesBatchAsync([]);

        Assert.Empty(result);
    }

    [Fact]
    public async Task ResolveAliasesBatchAsync_AllWhitespace_ReturnsEmptyDictWithoutDbCall()
    {
        var service = BuildService();

        var result = await service.ResolveAliasesBatchAsync(["  ", "\t", ""]);

        Assert.Empty(result);
    }

    // ── UpsertAliasAsync ──────────────────────────────────────────────────────

    [Fact]
    public async Task UpsertAliasAsync_EmptyString_ReturnsWithoutDbCall()
    {
        // Arrange
        var service = BuildService();

        // Act & Assert — must not throw even though Supabase.Client is null
        await service.UpsertAliasAsync(string.Empty, Guid.NewGuid());
    }

    [Fact]
    public async Task UpsertAliasAsync_WhitespaceOnly_ReturnsWithoutDbCall()
    {
        var service = BuildService();

        await service.UpsertAliasAsync("   ", Guid.NewGuid());
    }
}
