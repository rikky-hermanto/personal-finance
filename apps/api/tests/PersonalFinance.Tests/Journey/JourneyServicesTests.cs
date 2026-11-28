using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Infrastructure.Supabase;
using PersonalFinance.Tests.Cashflow;
using PersonalFinance.Tests.Support;
using Supabase.Postgrest.Exceptions;

namespace PersonalFinance.Tests.Journey;

/// <summary>
/// The PostgREST access behind the journey pages: the no-debts confirmation, the quest store and
/// goals. Each class runs as written against FakePostgrest, so these tests assert the requests it
/// sends. The fake does not check RLS or SQL.
/// </summary>
public sealed class JourneyServicesTests
{
    private const string Bearer = $"Bearer {TestCaller.Token}";

    private static JsonElement Body(RecordedRequest request) =>
        JsonDocument.Parse(request.Body).RootElement.Clone();

    public sealed class JourneyConfirmationServiceTests
    {
        private static async Task<JourneyConfirmationService> CreateServiceAsync(FakePostgrest fake) =>
            new(await fake.CreateClientAsync(), NullLogger<JourneyConfirmationService>.Instance);

        [Fact]
        public async Task GetNoDebtsConfirmedAtAsync_RowExists_ReturnsUtc()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "user_journey_state", CashflowRows.Json(new
            {
                user_id = TestCaller.Id,
                no_debts_confirmed_at = "2026-10-01T10:00:00+00:00",
            }));
            var service = await CreateServiceAsync(fake);

            // Act
            var confirmedAt = await service.GetNoDebtsConfirmedAtAsync(TestCaller.Id);

            // Assert
            Assert.NotNull(confirmedAt);
            Assert.Equal(DateTimeKind.Utc, confirmedAt.Value.Kind);
            Assert.Equal(new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc), confirmedAt.Value);
            var request = Assert.Single(fake.Requests);
            Assert.Contains($"user_id=eq.{TestCaller.Id}", CashflowRows.Query(request));
        }

        [Fact]
        public async Task GetNoDebtsConfirmedAtAsync_NoRow_ReturnsNull()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "user_journey_state", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var confirmedAt = await service.GetNoDebtsConfirmedAtAsync(TestCaller.Id);

            // Assert
            Assert.Null(confirmedAt);
        }

        [Fact]
        public async Task SetNoDebtsConfirmedAtAsync_UpsertsSingleRow()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "user_journey_state", "[]", 201);
            var service = await CreateServiceAsync(fake);

            // Act
            await service.SetNoDebtsConfirmedAtAsync(
                TestCaller.Id, new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc));

            // Assert
            var request = Assert.Single(fake.Requests);
            Assert.Equal("POST", request.Method);
            Assert.Equal("user_journey_state", request.Table);
            Assert.Contains("resolution=merge-duplicates", request.Headers["Prefer"]);
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            var body = Body(request);
            Assert.Equal(TestCaller.Id, body.GetProperty("user_id").GetGuid());
            // A partial upsert: sending any score column here would overwrite the stored scores.
            Assert.Equal(
                new[] { "no_debts_confirmed_at", "user_id" },
                body.EnumerateObject().Select(p => p.Name).Order());
        }
    }

    public sealed class SupabaseQuestStoreTests
    {
        private const string DuplicateKeyError =
            """{"code":"23505","message":"duplicate key value violates unique constraint \"quest_completions_user_id_quest_code_rung_key\"","details":"...","hint":null}""";

        private static async Task<SupabaseQuestStore> CreateStoreAsync(FakePostgrest fake) =>
            new(await fake.CreateClientAsync(), NullLogger<SupabaseQuestStore>.Instance);

        private static QuestCompletion Completion(string code, short rung) => new()
        {
            UserId = TestCaller.Id,
            QuestCode = code,
            Rung = rung,
            CatalogVersion = 1,
            Evidence = new Dictionary<string, object?> { ["months"] = 3 },
        };

        private static object CompletionRow(long id, string code, short rung, string? seenAt) => new
        {
            id,
            user_id = TestCaller.Id,
            quest_code = code,
            rung,
            catalog_version = 1,
            evidence = new { months = 3 },
            completed_at = "2026-10-01T10:00:00+00:00",
            seen_at = seenAt,
        };

        [Fact]
        public async Task InsertCompletionsAsync_NeverCallsDeleteOrPatch()
        {
            // Arrange: completions are append-only.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "quest_completions", "", 201);
            var store = await CreateStoreAsync(fake);

            // Act
            await store.InsertCompletionsAsync([Completion("first_quest", 1), Completion("second_quest", 2)]);

            // Assert
            Assert.DoesNotContain(fake.Requests,
                r => r.Table == "quest_completions" && r.Method is "DELETE" or "PATCH");

            // One plain insert per row, never an upsert that could overwrite seen_at.
            var inserts = fake.RequestsTo("POST", "quest_completions").ToList();
            Assert.Equal(2, inserts.Count);
            Assert.All(inserts, r =>
            {
                Assert.DoesNotContain("resolution=", r.Headers["Prefer"]);
                Assert.Equal(Bearer, r.Headers["Authorization"]);
                Assert.Equal(TestCaller.Id, Body(r).GetProperty("user_id").GetGuid());
            });
            Assert.Equal(
                new[] { "first_quest", "second_quest" },
                inserts.Select(r => Body(r).GetProperty("quest_code").GetString()!));
        }

        [Fact]
        public async Task InsertCompletionsAsync_DuplicateKey_SilentlySwallowed()
        {
            // Arrange: the first row is already stored, the second is new.
            await using var fake = await FakePostgrest.StartAsync();
            var posts = 0;
            fake.On("POST", "quest_completions", _ => Interlocked.Increment(ref posts) == 1
                ? new FakeResponse(DuplicateKeyError, 409)
                : new FakeResponse("", 201));
            var store = await CreateStoreAsync(fake);

            // Act
            var exception = await Record.ExceptionAsync(() =>
                store.InsertCompletionsAsync([Completion("first_quest", 1), Completion("second_quest", 2)]));

            // Assert: no throw, and the row after the duplicate is still written.
            Assert.Null(exception);
            Assert.Equal(2, fake.RequestsTo("POST", "quest_completions").Count());
        }

        [Fact]
        public async Task InsertCompletionsAsync_EmptyList_IssuesNoRequests()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            var store = await CreateStoreAsync(fake);

            // Act
            await store.InsertCompletionsAsync([]);

            // Assert
            Assert.Empty(fake.Requests);
        }

        [Fact]
        public async Task LoadCompletionsAsync_ReturnsRows()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "quest_completions", CashflowRows.Json(
                CompletionRow(1, "first_quest", 1, "2026-10-02T10:00:00+00:00"),
                CompletionRow(2, "second_quest", 2, null)));
            var store = await CreateStoreAsync(fake);

            // Act
            var rows = await store.LoadCompletionsAsync(TestCaller.Id);

            // Assert
            Assert.Equal(new[] { "first_quest", "second_quest" }, rows.Select(r => r.QuestCode));
            Assert.Equal(new long[] { 1, 2 }, rows.Select(r => r.Id));
            Assert.NotNull(rows[0].SeenAt);
            Assert.Null(rows[1].SeenAt);
            var query = CashflowRows.Query(Assert.Single(fake.Requests));
            Assert.Contains($"user_id=eq.{TestCaller.Id}", query);
            Assert.Contains("order=completed_at.asc", query);
        }

        [Fact]
        public async Task MarkSeenAsync_IssuesPatchToQuestCompletions()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("PATCH", "quest_completions", "[]");
            var store = await CreateStoreAsync(fake);

            // Act
            await store.MarkSeenAsync(
                TestCaller.Id, [7, 9], new DateTime(2026, 10, 2, 10, 0, 0, DateTimeKind.Utc));

            // Assert
            var request = Assert.Single(fake.Requests);
            Assert.Equal("PATCH", request.Method);
            Assert.Equal("quest_completions", request.Table);
            Assert.Equal(Bearer, request.Headers["Authorization"]);

            var query = CashflowRows.Query(request);
            Assert.Contains($"user_id=eq.{TestCaller.Id}", query);
            Assert.Matches("""id=in\.\("?7"?,"?9"?\)""", query);
            // Only unseen rows, so an earlier seen_at is kept.
            Assert.Contains("seen_at=is.null", query);
            // seen_at is the only column an update may touch.
            Assert.Equal("seen_at", Assert.Single(Body(request).EnumerateObject()).Name);
        }
    }

    public sealed class GoalServiceTests
    {
        private static readonly Guid GoalId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        private static readonly Guid OtherGoalId = Guid.Parse("55555555-5555-5555-5555-555555555555");

        private static async Task<GoalService> CreateServiceAsync(FakePostgrest fake) =>
            new(await fake.CreateClientAsync(), NullLogger<GoalService>.Instance);

        private static object GoalRow(Guid id, string name) => new
        {
            id,
            user_id = TestCaller.Id,
            kind = "big_purchase",
            tier = "L3",
            category = "vehicle",
            name,
            priority = 2,
            recurrence = "one_off",
            target_amount = 250_000_000.50m,
            currency = "IDR",
            status = "active",
            color_index = 0,
            created_at = "2026-10-01T10:00:00+00:00",
            updated_at = "2026-10-01T10:00:00+00:00",
        };

        private static object ContributionRow(Guid id, decimal amount) => new
        {
            id,
            user_id = TestCaller.Id,
            goal_id = GoalId,
            amount,
            contributed_on = "2026-10-01",
            created_at = "2026-10-01T10:00:00+00:00",
        };

        [Fact]
        public async Task ListAsync_WithKindFilter_AppliesKindToQuery()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("HEAD", "goals", "", contentRange: "0-0/2")
                .On("GET", "goals", CashflowRows.Json(GoalRow(GoalId, "Car"), GoalRow(OtherGoalId, "Motorbike")));
            var service = await CreateServiceAsync(fake);

            // Act
            var (items, total) = await service.ListAsync("big_purchase", [], page: 1, pageSize: 50);

            // Assert
            Assert.Equal(2, total);
            Assert.Equal(new[] { "Car", "Motorbike" }, items.Select(g => g.Name));
            // The count and the page must be filtered the same way, or the total is wrong.
            var count = Assert.Single(fake.RequestsTo("HEAD", "goals"));
            Assert.Contains("kind=eq.big_purchase", CashflowRows.Query(count));
            var page = Assert.Single(fake.RequestsTo("GET", "goals"));
            Assert.Contains("kind=eq.big_purchase", CashflowRows.Query(page));
        }

        [Fact]
        public async Task ListAsync_ZeroTotal_SkipsGetRequest()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("HEAD", "goals", "", contentRange: "0-0/0");
            var service = await CreateServiceAsync(fake);

            // Act
            var (items, total) = await service.ListAsync(null, [], page: 1, pageSize: 50);

            // Assert
            Assert.Equal(0, total);
            Assert.Empty(items);
            Assert.Empty(fake.RequestsTo("GET", "goals"));
        }

        [Fact]
        public async Task InsertAsync_EchoesBack()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "goals", CashflowRows.Json(GoalRow(GoalId, "Car")), 201);
            var service = await CreateServiceAsync(fake);

            // Act
            var inserted = await service.InsertAsync(new Goal
            {
                UserId = TestCaller.Id,
                Kind = "big_purchase",
                Tier = "L3",
                Category = "vehicle",
                Name = "Car",
                TargetAmount = 250_000_000.50m,
            });

            // Assert
            Assert.Equal(GoalId, inserted.Id);
            Assert.Equal("Car", inserted.Name);
            Assert.Equal(250_000_000.50m, inserted.TargetAmount);

            var request = Assert.Single(fake.Requests);
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            var body = Body(request);
            Assert.Equal(TestCaller.Id, body.GetProperty("user_id").GetGuid());
            Assert.Equal(250_000_000.50m, body.GetProperty("target_amount").GetDecimal());
            // The database generates the id.
            Assert.False(body.TryGetProperty("id", out _));
        }

        [Fact]
        public async Task DeleteAsync_ExistingGoal_ReturnsTrue()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goals", CashflowRows.Json(GoalRow(GoalId, "Car")))
                .On("DELETE", "goals", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var deleted = await service.DeleteAsync(GoalId);

            // Assert
            Assert.True(deleted);
            var request = Assert.Single(fake.RequestsTo("DELETE", "goals"));
            // A delete has no body: RLS scopes the owner through the caller's token.
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            Assert.Equal($"?id=eq.{GoalId}", CashflowRows.Query(request));
        }

        [Fact]
        public async Task DeleteAsync_MissingGoal_ReturnsFalse()
        {
            // Arrange: DELETE is stubbed, so a stray one would succeed and be recorded.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goals", "[]")
                .On("DELETE", "goals", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var deleted = await service.DeleteAsync(GoalId);

            // Assert
            Assert.False(deleted);
            Assert.Empty(fake.RequestsTo("DELETE", "goals"));
        }

        [Fact]
        public async Task ContributionsForAsync_ReturnsRows()
        {
            // Arrange: a negative amount is a withdrawal.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goal_contributions", CashflowRows.Json(
                ContributionRow(Guid.Parse("66666666-6666-6666-6666-666666666666"), 1_500_000.25m),
                ContributionRow(Guid.Parse("77777777-7777-7777-7777-777777777777"), -500_000m)));
            var service = await CreateServiceAsync(fake);

            // Act
            var rows = await service.ContributionsForAsync([GoalId, OtherGoalId]);

            // Assert
            Assert.Equal(new[] { 1_500_000.25m, -500_000m }, rows.Select(r => r.Amount));
            Assert.All(rows, r => Assert.Equal(GoalId, r.GoalId));
            var query = CashflowRows.Query(Assert.Single(fake.Requests));
            Assert.Contains("goal_id=in.", query);
            Assert.Contains(GoalId.ToString(), query);
            Assert.Contains(OtherGoalId.ToString(), query);
        }

        private static readonly Guid AccountId = Guid.Parse("88888888-8888-8888-8888-888888888888");
        private static readonly Guid ContributionId = Guid.Parse("99999999-9999-9999-9999-999999999999");

        private static object CostItemRow(string itemType, decimal amount, short sortOrder) => new
        {
            id = Guid.NewGuid(),
            user_id = TestCaller.Id,
            goal_id = GoalId,
            item_type = itemType,
            label = itemType,
            amount,
            sort_order = sortOrder,
            created_at = "2026-10-01T10:00:00+00:00",
        };

        private static object HeldRow(Guid goalId, decimal amount) => new
        {
            id = Guid.NewGuid(),
            user_id = TestCaller.Id,
            goal_id = goalId,
            amount,
            contributed_on = "2026-10-01",
            held_in_account_id = AccountId,
            created_at = "2026-10-01T10:00:00+00:00",
        };

        private static Goal CarGoal() => new()
        {
            Id = GoalId,
            UserId = TestCaller.Id,
            Kind = "big_purchase",
            Tier = "L3",
            Category = "vehicle",
            Name = "Car",
            TargetAmount = 250_000_000.50m,
        };

        [Fact]
        public async Task ListAsync_StatusFilterAndSecondPage_SendsFiltersOrderAndRange()
        {
            // Arrange: three goals match, two to a page.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("HEAD", "goals", "", contentRange: "0-0/3")
                .On("GET", "goals", CashflowRows.Json(GoalRow(GoalId, "Car")));
            var service = await CreateServiceAsync(fake);

            // Act
            var (items, total) = await service.ListAsync(null, ["active", "paused"], page: 2, pageSize: 2);

            // Assert
            Assert.Equal(3, total);
            Assert.Equal("Car", Assert.Single(items).Name);
            var count = CashflowRows.Query(Assert.Single(fake.RequestsTo("HEAD", "goals")));
            var request = Assert.Single(fake.RequestsTo("GET", "goals"));
            var query = CashflowRows.Query(request);
            const string statusFilter = """status=in\.\("?active"?,"?paused"?\)""";
            Assert.Matches(statusFilter, count);
            Assert.Matches(statusFilter, query);
            Assert.DoesNotContain("kind=", query);
            Assert.Matches(@"order=priority\.asc[^,&]*,target_date\.asc\.nullslast,created_at\.asc", query);
            Assert.Equal("2-3", request.Headers["Range"]);
        }

        [Fact]
        public async Task ListAsync_PageBeyondEnd_ReturnsTotalAndSkipsGet()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("HEAD", "goals", "", contentRange: "0-0/3");
            var service = await CreateServiceAsync(fake);

            // Act
            var (items, total) = await service.ListAsync(null, [], page: 3, pageSize: 2);

            // Assert
            Assert.Equal(3, total);
            Assert.Empty(items);
            Assert.Empty(fake.RequestsTo("GET", "goals"));
        }

        [Fact]
        public async Task UpdateAsync_TargetDateAtLocalMidnight_SendsTheSameCalendarDate()
        {
            // Arrange: a `date` column reads back as local midnight with no kind.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("PATCH", "goals", CashflowRows.Json(GoalRow(GoalId, "Car")));
            var service = await CreateServiceAsync(fake);
            var goal = CarGoal();
            goal.TargetDate = new DateTime(2027, 3, 15, 0, 0, 0, DateTimeKind.Unspecified);

            // Act
            var updated = await service.UpdateAsync(goal);

            // Assert
            Assert.Equal(GoalId, updated?.Id);
            var request = Assert.Single(fake.Requests);
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            // Update(model) adds the SDK's own primary-key filter next to the service's, so id appears
            // twice. Both must name this goal and nothing else may be in the query.
            Assert.All(
                CashflowRows.Query(request).TrimStart('?').Split('&'),
                filter => Assert.Equal($"id=eq.{GoalId}", filter));
            var body = Body(request);
            Assert.StartsWith("2027-03-15", body.GetProperty("target_date").GetString());
            Assert.Equal(TestCaller.Id, body.GetProperty("user_id").GetGuid());
            Assert.Equal(250_000_000.50m, body.GetProperty("target_amount").GetDecimal());
            Assert.False(body.TryGetProperty("created_at", out _));
        }

        [Fact]
        public async Task UpdateAsync_NoMatchingRow_ReturnsNull()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("PATCH", "goals", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var updated = await service.UpdateAsync(CarGoal());

            // Assert
            Assert.Null(updated);
        }

        [Fact]
        public async Task NextColorIndexAsync_NoGoals_ReturnsZero()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goals", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var next = await service.NextColorIndexAsync();

            // Assert
            Assert.Equal(0, next);
        }

        [Fact]
        public async Task NextColorIndexAsync_HighestIsThree_ReturnsFour()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goals", CashflowRows.Json(new { id = GoalId, user_id = TestCaller.Id, color_index = 3 }));
            var service = await CreateServiceAsync(fake);

            // Act
            var next = await service.NextColorIndexAsync();

            // Assert
            Assert.Equal(4, next);
            var request = Assert.Single(fake.Requests);
            Assert.Contains("order=color_index.desc", CashflowRows.Query(request));
            Assert.Equal("0-0", request.Headers["Range"]);
        }

        [Fact]
        public async Task ContributionPageAsync_SecondPage_ReturnsNewestFirstRange()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("HEAD", "goal_contributions", "", contentRange: "0-0/3")
                .On("GET", "goal_contributions", CashflowRows.Json(ContributionRow(ContributionId, 750_000m)));
            var service = await CreateServiceAsync(fake);

            // Act
            var (items, total) = await service.ContributionPageAsync(GoalId, page: 2, pageSize: 2);

            // Assert
            Assert.Equal(3, total);
            Assert.Equal(750_000m, Assert.Single(items).Amount);
            var count = Assert.Single(fake.RequestsTo("HEAD", "goal_contributions"));
            Assert.Contains($"goal_id=eq.{GoalId}", CashflowRows.Query(count));
            var request = Assert.Single(fake.RequestsTo("GET", "goal_contributions"));
            var query = CashflowRows.Query(request);
            Assert.Contains($"goal_id=eq.{GoalId}", query);
            Assert.Matches(@"order=contributed_on\.desc[^,&]*,created_at\.desc", query);
            Assert.Equal("2-3", request.Headers["Range"]);
        }

        [Fact]
        public async Task ContributionPageAsync_NoRows_SkipsGetRequest()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("HEAD", "goal_contributions", "", contentRange: "0-0/0");
            var service = await CreateServiceAsync(fake);

            // Act
            var (items, total) = await service.ContributionPageAsync(GoalId, page: 1, pageSize: 50);

            // Assert
            Assert.Equal(0, total);
            Assert.Empty(items);
            Assert.Empty(fake.RequestsTo("GET", "goal_contributions"));
        }

        [Fact]
        public async Task InsertContributionAsync_Withdrawal_SendsExactAmountAndOwner()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "goal_contributions",
                CashflowRows.Json(ContributionRow(ContributionId, -500_000.25m)), 201);
            var service = await CreateServiceAsync(fake);

            // Act
            var inserted = await service.InsertContributionAsync(new GoalContribution
            {
                UserId = TestCaller.Id,
                GoalId = GoalId,
                Amount = -500_000.25m,
                ContributedOn = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
            });

            // Assert
            Assert.Equal(ContributionId, inserted.Id);
            Assert.Equal(-500_000.25m, inserted.Amount);
            var request = Assert.Single(fake.Requests);
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            var body = Body(request);
            Assert.Equal(TestCaller.Id, body.GetProperty("user_id").GetGuid());
            Assert.Equal(GoalId, body.GetProperty("goal_id").GetGuid());
            Assert.Equal(-500_000.25m, body.GetProperty("amount").GetDecimal());
            Assert.StartsWith("2026-10-01", body.GetProperty("contributed_on").GetString());
        }

        [Fact]
        public async Task DeleteContributionAsync_Existing_DeletesWithinTheGoal()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goal_contributions", CashflowRows.Json(ContributionRow(ContributionId, 1_000m)))
                .On("DELETE", "goal_contributions", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var deleted = await service.DeleteContributionAsync(GoalId, ContributionId);

            // Assert
            Assert.True(deleted);
            var request = Assert.Single(fake.RequestsTo("DELETE", "goal_contributions"));
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            var query = CashflowRows.Query(request);
            Assert.Contains($"id=eq.{ContributionId}", query);
            Assert.Contains($"goal_id=eq.{GoalId}", query);
        }

        [Fact]
        public async Task DeleteContributionAsync_NotInThisGoal_ReturnsFalseWithoutDelete()
        {
            // Arrange: DELETE is stubbed, so a stray one would succeed and be recorded.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goal_contributions", "[]")
                .On("DELETE", "goal_contributions", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var deleted = await service.DeleteContributionAsync(OtherGoalId, ContributionId);

            // Assert
            Assert.False(deleted);
            var lookup = CashflowRows.Query(Assert.Single(fake.Requests));
            Assert.Contains($"goal_id=eq.{OtherGoalId}", lookup);
        }

        [Fact]
        public async Task CostItemsForAsync_NoGoalIds_SendsNoRequest()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            var service = await CreateServiceAsync(fake);

            // Act
            var rows = await service.CostItemsForAsync([]);

            // Assert
            Assert.Empty(rows);
            Assert.Empty(fake.Requests);
        }

        [Fact]
        public async Task CostItemsForAsync_GoalIds_ReadsRowsInSortOrder()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goal_cost_items", CashflowRows.Json(
                CostItemRow("down_payment", 50_000_000m, 0), CostItemRow("tax", 7_500_000.75m, 1)));
            var service = await CreateServiceAsync(fake);

            // Act
            var rows = await service.CostItemsForAsync([GoalId]);

            // Assert
            Assert.Equal(new[] { 50_000_000m, 7_500_000.75m }, rows.Select(r => r.Amount));
            var query = CashflowRows.Query(Assert.Single(fake.Requests));
            Assert.Contains("goal_id=in.", query);
            Assert.Contains("order=sort_order.asc", query);
        }

        [Fact]
        public async Task ReplaceCostItemsAsync_NewItems_DeletesThenInsertsWithOwner()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("DELETE", "goal_cost_items", "[]")
                .On("POST", "goal_cost_items", CashflowRows.Json(
                    CostItemRow("down_payment", 50_000_000m, 0), CostItemRow("tax", 7_500_000.75m, 1)), 201);
            var service = await CreateServiceAsync(fake);
            GoalCostItem Item(string type, decimal amount, short order) => new()
            {
                UserId = TestCaller.Id, GoalId = GoalId, ItemType = type, Label = type,
                Amount = amount, SortOrder = order,
            };

            // Act
            var saved = await service.ReplaceCostItemsAsync(
                GoalId, [Item("down_payment", 50_000_000m, 0), Item("tax", 7_500_000.75m, 1)]);

            // Assert
            Assert.Equal(2, saved.Count);
            Assert.Equal(new[] { "DELETE", "POST" }, fake.Requests.Select(r => r.Method));
            Assert.All(fake.Requests, r => Assert.Equal(Bearer, r.Headers["Authorization"]));
            Assert.Equal($"?goal_id=eq.{GoalId}", CashflowRows.Query(fake.Requests[0]));
            var sent = Body(fake.Requests[1]).EnumerateArray().ToList();
            Assert.All(sent, row => Assert.Equal(TestCaller.Id, row.GetProperty("user_id").GetGuid()));
            Assert.Equal(
                new[] { 50_000_000m, 7_500_000.75m },
                sent.Select(row => row.GetProperty("amount").GetDecimal()));
        }

        [Fact]
        public async Task ReplaceCostItemsAsync_EmptyList_OnlyDeletes()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("DELETE", "goal_cost_items", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var saved = await service.ReplaceCostItemsAsync(GoalId, []);

            // Assert
            Assert.Empty(saved);
            Assert.Equal("DELETE", Assert.Single(fake.Requests).Method);
        }

        [Fact]
        public async Task EarmarkedInAccountsAsync_SumsOpenGoalContributionsOnly()
        {
            // Arrange: GoalId and OtherGoalId are open. The third goal is closed, so the goals read,
            // which filters on status, does not return it.
            var closedGoalId = Guid.Parse("abababab-abab-abab-abab-abababababab");
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goal_contributions", CashflowRows.Json(
                    HeldRow(GoalId, 2_000_000.50m), HeldRow(GoalId, -500_000.25m),
                    HeldRow(OtherGoalId, 1_000_000m), HeldRow(closedGoalId, 5_000_000m)))
                .On("GET", "goals", CashflowRows.Json(GoalRow(GoalId, "Car"), GoalRow(OtherGoalId, "Motorbike")));
            var service = await CreateServiceAsync(fake);

            // Act
            var earmarked = await service.EarmarkedInAccountsAsync([AccountId]);

            // Assert: 2,000,000.50 - 500,000.25 + 1,000,000 (the closed goal's 5,000,000 is left out).
            Assert.Equal(2_500_000.25m, earmarked);
            var held = CashflowRows.Query(Assert.Single(fake.RequestsTo("GET", "goal_contributions")));
            Assert.Contains("held_in_account_id=in.", held);
            var goals = CashflowRows.Query(Assert.Single(fake.RequestsTo("GET", "goals")));
            Assert.Matches("""status=in\.\("?active"?,"?paused"?\)""", goals);
            Assert.Contains(closedGoalId.ToString(), goals);
        }

        [Fact]
        public async Task EarmarkedInAccountsAsync_NoAccounts_SendsNoRequest()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            var service = await CreateServiceAsync(fake);

            // Act
            var earmarked = await service.EarmarkedInAccountsAsync([]);

            // Assert
            Assert.Equal(0m, earmarked);
            Assert.Empty(fake.Requests);
        }

        [Fact]
        public async Task EarmarkedInAccountsAsync_NoContributions_ReturnsZeroWithoutReadingGoals()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goal_contributions", "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var earmarked = await service.EarmarkedInAccountsAsync([AccountId]);

            // Assert
            Assert.Equal(0m, earmarked);
            Assert.Empty(fake.RequestsTo("GET", "goals"));
        }

        [Fact]
        public async Task EarmarkedInAccountsAsync_GoalReadFails_ThrowsInsteadOfReturningZero()
        {
            // Arrange: a failed read must not look like "nothing earmarked".
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "goal_contributions", CashflowRows.Json(HeldRow(GoalId, 1_000m)))
                .On("GET", "goals", CashflowRows.ServerError, 500);
            var service = await CreateServiceAsync(fake);

            // Act and Assert
            await Assert.ThrowsAsync<PostgrestException>(() => service.EarmarkedInAccountsAsync([AccountId]));
        }

        [Theory]
        [InlineData(true)]
        [InlineData(false)]
        public async Task AccountVisibleAsync_FollowsWhetherARowComesBack(bool visible)
        {
            // Arrange: RLS hides another owner's account, which reads as no row.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "accounts",
                visible ? CashflowRows.Json(CashflowRows.Account(AccountId, "BCA")) : "[]");
            var service = await CreateServiceAsync(fake);

            // Act
            var result = await service.AccountVisibleAsync(AccountId);

            // Assert
            Assert.Equal(visible, result);
            Assert.Contains($"id=eq.{AccountId}", CashflowRows.Query(Assert.Single(fake.Requests)));
        }
    }

    public sealed class SupabaseQuestStoreReadAndPreferenceTests
    {
        private static readonly Guid AccountId = Guid.Parse("88888888-8888-8888-8888-888888888888");

        private readonly Mock<ILogger<SupabaseQuestStore>> _logger = new();

        private async Task<SupabaseQuestStore> CreateStoreAsync(FakePostgrest fake) =>
            new(await fake.CreateClientAsync(), _logger.Object);

        private void VerifyOneErrorLogged() => _logger.Verify(l => l.Log(
            LogLevel.Error,
            It.IsAny<EventId>(),
            It.IsAny<It.IsAnyType>(),
            It.IsAny<Exception>(),
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.Once);

        [Fact]
        public async Task LoadCashflowAccountsAsync_ReadsOnlyTheOwnersActiveCashflowAccounts()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "accounts", CashflowRows.Json(CashflowRows.Account(AccountId, "BCA")));
            var store = await CreateStoreAsync(fake);

            // Act
            var accounts = await store.LoadCashflowAccountsAsync(TestCaller.Id);

            // Assert
            Assert.Equal("BCA", Assert.Single(accounts).Name);
            var query = CashflowRows.Query(Assert.Single(fake.Requests));
            Assert.Contains($"user_id=eq.{TestCaller.Id}", query);
            Assert.Contains("is_active=eq.true", query);
            Assert.Contains("include_in_cashflow=eq.true", query);
        }

        [Theory]
        [InlineData("""[{"id":1}]""", true)]
        [InlineData("[]", false)]
        public async Task AnyTransactionAsync_AsksForOneRowWithNoDateWindow(string rows, bool expected)
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "transactions", rows);
            var store = await CreateStoreAsync(fake);

            // Act
            var any = await store.AnyTransactionAsync(TestCaller.Id);

            // Assert
            Assert.Equal(expected, any);
            var query = CashflowRows.Query(Assert.Single(fake.Requests));
            Assert.Contains("select=id", query);
            Assert.Contains("limit=1", query);
            Assert.Contains($"user_id=eq.{TestCaller.Id}", query);
            Assert.DoesNotContain("date=", query);
        }

        [Fact]
        public async Task LoadStateAsync_RowExists_ReturnsScoresFocusAndSnoozes()
        {
            // Arrange: three models read different columns of the same row.
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "user_journey_state", CashflowRows.Json(new
            {
                user_id = TestCaller.Id,
                current_level = 2,
                total_score = 66.67m,
                level_scores = """{"L1":100}""",
                indicator_scores = """{"spend_lt_income":100}""",
                indicator_raw = new Dictionary<string, decimal> { ["spend_lt_income"] = 0.8m },
                last_computed_at = "2026-10-15T10:00:00+00:00",
                focus_quest_code = "l1.sort_the_pile",
                quest_snoozes = new Dictionary<string, string> { ["l2.cushion"] = "2026-11-25" },
            }));
            var store = await CreateStoreAsync(fake);

            // Act
            var state = await store.LoadStateAsync(TestCaller.Id);

            // Assert
            Assert.Equal(66.67m, state.Scores?.TotalScore);
            Assert.Equal(0.8m, state.Scores?.IndicatorRaw["spend_lt_income"]);
            Assert.Equal("l1.sort_the_pile", state.FocusQuestCode);
            Assert.Equal("2026-11-25", state.Snoozes["l2.cushion"]);
            Assert.Equal(3, fake.Requests.Count);
            Assert.All(fake.Requests,
                r => Assert.Contains($"user_id=eq.{TestCaller.Id}", CashflowRows.Query(r)));
        }

        [Fact]
        public async Task LoadStateAsync_NoRow_ReturnsNoScoresNoFocusAndNoSnoozes()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("GET", "user_journey_state", "[]");
            var store = await CreateStoreAsync(fake);

            // Act
            var state = await store.LoadStateAsync(TestCaller.Id);

            // Assert
            Assert.Null(state.Scores);
            Assert.Null(state.FocusQuestCode);
            Assert.Empty(state.Snoozes);
        }

        [Theory]
        [InlineData("l1.sort_the_pile")]
        [InlineData(null)]
        public async Task SetFocusAsync_UpsertsOnlyTheFocusColumn(string? questCode)
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "user_journey_state", "[]", 201);
            var store = await CreateStoreAsync(fake);

            // Act
            await store.SetFocusAsync(TestCaller.Id, questCode);

            // Assert
            var request = Assert.Single(fake.Requests);
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            Assert.Contains("resolution=merge-duplicates", request.Headers["Prefer"]);
            var body = Body(request);
            // Any score or snooze column here would overwrite the stored value.
            Assert.Equal(
                new[] { "focus_quest_code", "user_id" }, body.EnumerateObject().Select(p => p.Name).Order());
            Assert.Equal(TestCaller.Id, body.GetProperty("user_id").GetGuid());
            // Clearing the focus must send null, or the old value stays.
            Assert.Equal(questCode, body.GetProperty("focus_quest_code").GetString());
        }

        [Fact]
        public async Task SetSnoozesAsync_UpsertsOnlyTheSnoozeColumn()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "user_journey_state", "[]", 201);
            var store = await CreateStoreAsync(fake);

            // Act
            await store.SetSnoozesAsync(
                TestCaller.Id, new Dictionary<string, string> { ["l1.sort_the_pile"] = "2026-11-25" });

            // Assert
            var request = Assert.Single(fake.Requests);
            Assert.Equal(Bearer, request.Headers["Authorization"]);
            Assert.Contains("resolution=merge-duplicates", request.Headers["Prefer"]);
            var body = Body(request);
            Assert.Equal(
                new[] { "quest_snoozes", "user_id" }, body.EnumerateObject().Select(p => p.Name).Order());
            Assert.Equal(TestCaller.Id, body.GetProperty("user_id").GetGuid());
            Assert.Equal(
                "2026-11-25", body.GetProperty("quest_snoozes").GetProperty("l1.sort_the_pile").GetString());
        }

        [Theory]
        [InlineData("focus")]
        [InlineData("snoozes")]
        [InlineData("seen")]
        [InlineData("completion")]
        public async Task Write_ServerError_LogsAndRethrows(string write)
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "user_journey_state", CashflowRows.ServerError, 500)
                .On("PATCH", "quest_completions", CashflowRows.ServerError, 500)
                .On("POST", "quest_completions", CashflowRows.ServerError, 500);
            var store = await CreateStoreAsync(fake);
            Func<Task> act = write switch
            {
                "focus" => () => store.SetFocusAsync(TestCaller.Id, "l1.sort_the_pile"),
                "snoozes" => () => store.SetSnoozesAsync(TestCaller.Id, new Dictionary<string, string>()),
                "seen" => () => store.MarkSeenAsync(TestCaller.Id, [7], DateTime.UtcNow),
                _ => () => store.InsertCompletionsAsync(
                    [new QuestCompletion { UserId = TestCaller.Id, QuestCode = "first_quest", Rung = 1 }]),
            };

            // Act and Assert
            await Assert.ThrowsAsync<PostgrestException>(act);
            VerifyOneErrorLogged();
        }

        [Fact]
        public async Task InsertCompletionsAsync_PrimaryKeyClash_IsNotSwallowed()
        {
            // Arrange: only a clash on the quest and rung key means "already stored".
            await using var fake = await FakePostgrest.StartAsync();
            fake.On("POST", "quest_completions",
                """{"code":"23505","message":"duplicate key value violates unique constraint \"quest_completions_pkey\"","details":"...","hint":null}""",
                409);
            var store = await CreateStoreAsync(fake);

            // Act and Assert
            await Assert.ThrowsAsync<PostgrestException>(() => store.InsertCompletionsAsync(
                [new QuestCompletion { UserId = TestCaller.Id, QuestCode = "first_quest", Rung = 1 }]));
            VerifyOneErrorLogged();
        }

        [Fact]
        public async Task MarkSeenAsync_NoIds_SendsNoRequest()
        {
            // Arrange
            await using var fake = await FakePostgrest.StartAsync();
            var store = await CreateStoreAsync(fake);

            // Act
            await store.MarkSeenAsync(TestCaller.Id, [], DateTime.UtcNow);

            // Assert
            Assert.Empty(fake.Requests);
        }
    }
}
