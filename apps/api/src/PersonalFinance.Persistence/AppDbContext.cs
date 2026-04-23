using Microsoft.EntityFrameworkCore;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Persistence
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Transaction> Transactions => Set<Transaction>();
        public DbSet<CategoryRule> CategoryRules => Set<CategoryRule>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Transaction>(entity =>
            {
                entity.ToTable("transactions");
                entity.Property(t => t.Category).HasMaxLength(100);
                entity.Property(t => t.Description).HasMaxLength(500);
                entity.Property(t => t.Remarks).HasMaxLength(500);
                entity.Property(t => t.Flow).HasMaxLength(5);
                entity.Property(t => t.Type).HasMaxLength(15);
                entity.Property(t => t.Wallet).HasMaxLength(50);
                entity.Property(t => t.Currency).HasMaxLength(10);

                // Configure DateTime to be stored and retrieved as UTC
                entity.Property(t => t.Date)
                    .HasConversion(
                        v => v.ToUniversalTime(),
                        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
            });

            modelBuilder.Entity<CategoryRule>(entity =>
            {
                entity.ToTable("category_rules");
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Id).ValueGeneratedOnAdd();
                entity.Property(c => c.Keyword).HasMaxLength(100);
                entity.Property(c => c.Type).HasMaxLength(50);
                entity.Property(c => c.Category).HasMaxLength(100);
            });
        }
    }
}
