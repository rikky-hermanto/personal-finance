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
                entity.Property(t => t.Description).HasMaxLength(255);
                entity.Property(t => t.Remarks).HasMaxLength(255);
                entity.Property(t => t.Flow).HasMaxLength(10);
                entity.Property(t => t.Type).HasMaxLength(10);
                entity.Property(t => t.Wallet).HasMaxLength(50);
                entity.Property(t => t.Currency).HasMaxLength(10);
            });

            modelBuilder.Entity<CategoryRule>(entity =>
            {
                entity.ToTable("category_rules");
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Id).ValueGeneratedOnAdd();
                entity.Property(c => c.Keyword).HasMaxLength(100);
                entity.Property(c => c.Type).HasMaxLength(50);
                entity.Property(c => c.Category).HasMaxLength(100);

                entity.HasData(
                    new CategoryRule { Id = 1, Keyword = "BI-FAST CR TRANSFER   DR 562 RIKKI H HASIBUAN", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 2, Keyword = "BI-FAST CR TRANSFER   DR 490 RIKKI H HASIBUAN", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 3, Keyword = "TRANSFER OUT RIKKI H HASIBUAN 1310013349", Type = "Saving", Category = "" },
                    new CategoryRule { Id = 4, Keyword = "TRANSFER OUT MUHAMMAD IZUDDIN HAN", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 5, Keyword = "Sent money to Rikki H Hasibuan", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 6, Keyword = "Transfer dari RIKKI H HASIBUAN", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 7, Keyword = "TRANSFER OUT RIKKI H HASIBUAN", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 8, Keyword = "Transfer ke Rikki H Hasibuan", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 9, Keyword = "TRANSFER IN SYAFTRACO", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 10, Keyword = "Yayasan Bali Rescue", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 11, Keyword = "BERKAT LISAN MULIA", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 12, Keyword = "KADEK KRISNA CHAND", Type = "Expense", Category = "Self-Care" },
                    new CategoryRule { Id = 13, Keyword = "LIDYA EVANGELISTA", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 14, Keyword = "BALI RESCUE DOG", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 15, Keyword = "NI MADE CHRISTA", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 16, Keyword = "Nyoman Sunita", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 17, Keyword = "Bunga Didapat", Type = "Income", Category = "Saving Interest" },
                    new CategoryRule { Id = 18, Keyword = "Saepul Anwar", Type = "Expense", Category = "Self-Care" },
                    new CategoryRule { Id = 19, Keyword = "Housekeeping", Type = "Expense", Category = "Housekeeping" },
                    new CategoryRule { Id = 20, Keyword = "KETUT CATRA", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 21, Keyword = "Olahan Laut", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 22, Keyword = "Red Dragon", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 23, Keyword = "Tomoro BNI", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 24, Keyword = "Bakso Solo", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 25, Keyword = "BALE UDANG", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 26, Keyword = "JUICE TIME", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 27, Keyword = "Rumah Maka", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 28, Keyword = "Kedai Kopi", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 29, Keyword = "Kopi Kenan", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 30, Keyword = "Gusto Gela", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 31, Keyword = "BIJI WORLD", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 32, Keyword = "NIRMALA BA", Type = "Expense", Category = "Groceries" },
                    new CategoryRule { Id = 33, Keyword = "Olahan Lau", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 34, Keyword = "Astra Moto", Type = "Expense", Category = "Motor/Car Service" },
                    new CategoryRule { Id = 35, Keyword = "Planet Ban", Type = "Expense", Category = "Motor/Car Service" },
                    new CategoryRule { Id = 36, Keyword = "DAPUR PRIM", Type = "Expense", Category = "Workstation" },
                    new CategoryRule { Id = 37, Keyword = "TIMBUL JAY", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 38, Keyword = "transferxx", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 39, Keyword = "AYAM KREME", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 40, Keyword = "RM ASLI MI", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 41, Keyword = "GRANDLUCKY", Type = "Expense", Category = "Groceries" },
                    new CategoryRule { Id = 42, Keyword = "WARKOP AGE", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 43, Keyword = "Coco Super", Type = "Expense", Category = "Groceries" },
                    new CategoryRule { Id = 44, Keyword = "WR WAJAR H", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 45, Keyword = "TELKOMSEL", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 46, Keyword = "Dimsum GM", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 47, Keyword = "RM PADANG", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 48, Keyword = "REDDRAGON", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 49, Keyword = "LAKSMI UD", Type = "Expense", Category = "Groceries" },
                    new CategoryRule { Id = 50, Keyword = "Furbabies", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 51, Keyword = "EKA PRINT", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 52, Keyword = "Biaya Adm", Type = "Expense", Category = "Transfer/Admin Fee" },
                    new CategoryRule { Id = 53, Keyword = "UBI BAKAR", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 54, Keyword = "MOTO KOPI", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 55, Keyword = "MULARASA", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 56, Keyword = "INTEREST", Type = "Income", Category = "Saving Interest" },
                    new CategoryRule { Id = 57, Keyword = "BCA CARD", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 58, Keyword = "Cinnamon", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 59, Keyword = "WSS BATU", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 60, Keyword = "Jus Masa", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 61, Keyword = "MISANTO", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 62, Keyword = "KYOUDAI", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 63, Keyword = "1310013", Type = "Saving", Category = "Stock" },
                    new CategoryRule { Id = 64, Keyword = "IZUDDIN", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 65, Keyword = "Netflix", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 66, Keyword = "chatGPT", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 67, Keyword = "Tarikan", Type = "Expense", Category = "Withdrawing" },
                    new CategoryRule { Id = 68, Keyword = "Holland", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 69, Keyword = "KWETIAU", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 70, Keyword = "Charges", Type = "Expense", Category = "Transfer/Admin Fee" },
                    new CategoryRule { Id = 71, Keyword = "LAKLAK", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 72, Keyword = "WIGUNA", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 73, Keyword = "Conato", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 74, Keyword = "Pepito", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 75, Keyword = "PT MNC", Type = "Expense", Category = "Entertainment" },
                    new CategoryRule { Id = 76, Keyword = "INDOMA", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 77, Keyword = "Es Teh", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 78, Keyword = "Sambal", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 79, Keyword = "WARUNG", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 80, Keyword = "Klinik", Type = "Expense", Category = "Medical" },
                    new CategoryRule { Id = 81, Keyword = "Uniqlo", Type = "Expense", Category = "Clothing" },
                    new CategoryRule { Id = 82, Keyword = "K2FLY", Type = "Income", Category = "Salary" },
                    new CategoryRule { Id = 83, Keyword = "CRxxx", Type = "Income", Category = "" },
                    new CategoryRule { Id = 84, Keyword = "Bills", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 85, Keyword = "londri", Type = "Expense", Category = "Housekeeping" },
                    new CategoryRule { Id = 86, Keyword = "Yoyok", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 87, Keyword = "Bubur", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 88, Keyword = "Gohan", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 89, Keyword = "Esteh", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 90, Keyword = "Donut", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 91, Keyword = "BAKMI", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 92, Keyword = "Bakso", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 93, Keyword = "Pempek", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 94, Keyword = "Pajak", Type = "Expense", Category = "Tax" },
                    new CategoryRule { Id = 95, Keyword = "Donat", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 96, Keyword = "nelly", Type = "Fund Switching", Category = "" },
                    new CategoryRule { Id = 97, Keyword = "BPJS", Type = "Expense", Category = "Bill" },
                    new CategoryRule { Id = 98, Keyword = "Roti", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 99, Keyword = "Nasi", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 100, Keyword = "Gogo", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 101, Keyword = "Arys", Type = "Expense", Category = "Groceries" },
                    new CategoryRule { Id = 102, Keyword = "Mie", Type = "Expense", Category = "Food" },
                    new CategoryRule { Id = 103, Keyword = "ARY", Type = "Expense", Category = "Groceries" },
                    new CategoryRule { Id = 104, Keyword = "PET", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 105, Keyword = "VET", Type = "Expense", Category = "Vet and Dog Supply" },
                    new CategoryRule { Id = 106, Keyword = "FEE", Type = "Expense", Category = "Transfer/Admin Fee" }
                );
            });
        }
    }
}
