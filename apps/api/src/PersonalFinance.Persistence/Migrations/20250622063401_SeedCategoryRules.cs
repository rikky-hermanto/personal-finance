using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace PersonalFinance.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SeedCategoryRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "category_rules",
                columns: new[] { "id", "category", "keyword", "keyword_length", "type" },
                values: new object[,]
                {
                    { 1, "", "BI-FAST CR TRANSFER   DR 562 RIKKI H HASIBUAN", 45, "Fund Switching" },
                    { 2, "", "BI-FAST CR TRANSFER   DR 490 RIKKI H HASIBUAN", 45, "Fund Switching" },
                    { 3, "", "TRANSFER OUT RIKKI H HASIBUAN 1310013349", 40, "Saving" },
                    { 4, "Bill", "TRANSFER OUT MUHAMMAD IZUDDIN HAN", 33, "Expense" },
                    { 5, "", "Sent money to Rikki H Hasibuan", 30, "Fund Switching" },
                    { 6, "", "Transfer dari RIKKI H HASIBUAN", 30, "Fund Switching" },
                    { 7, "", "TRANSFER OUT RIKKI H HASIBUAN", 29, "Fund Switching" },
                    { 8, "", "Transfer ke Rikki H Hasibuan", 28, "Fund Switching" },
                    { 9, "", "TRANSFER IN SYAFTRACO", 21, "Fund Switching" },
                    { 10, "Vet and Dog Supply", "Yayasan Bali Rescue", 19, "Expense" },
                    { 11, "Vet and Dog Supply", "BERKAT LISAN MULIA", 18, "Expense" },
                    { 12, "Self-Care", "KADEK KRISNA CHAND", 18, "Expense" },
                    { 13, "Bill", "LIDYA EVANGELISTA", 17, "Expense" },
                    { 14, "Vet and Dog Supply", "BALI RESCUE DOG", 15, "Expense" },
                    { 15, "Vet and Dog Supply", "NI MADE CHRISTA", 15, "Expense" },
                    { 16, "Vet and Dog Supply", "Nyoman Sunita", 13, "Expense" },
                    { 17, "Saving Interest", "Bunga Didapat", 13, "Income" },
                    { 18, "Self-Care", "Saepul Anwar", 12, "Expense" },
                    { 19, "Housekeeping", "Housekeeping", 12, "Expense" },
                    { 20, "Bill", "KETUT CATRA", 11, "Expense" },
                    { 21, "Food", "Olahan Laut", 11, "Expense" },
                    { 22, "Food", "Red Dragon", 10, "Expense" },
                    { 23, "Food", "Tomoro BNI", 10, "Expense" },
                    { 24, "Food", "Bakso Solo", 10, "Expense" },
                    { 25, "Food", "BALE UDANG", 10, "Expense" },
                    { 26, "Food", "JUICE TIME", 10, "Expense" },
                    { 27, "Food", "Rumah Maka", 10, "Expense" },
                    { 28, "Food", "Kedai Kopi", 10, "Expense" },
                    { 29, "Food", "Kopi Kenan", 10, "Expense" },
                    { 30, "Food", "Gusto Gela", 10, "Expense" },
                    { 31, "Food", "BIJI WORLD", 10, "Expense" },
                    { 32, "Groceries", "NIRMALA BA", 10, "Expense" },
                    { 33, "Food", "Olahan Lau", 10, "Expense" },
                    { 34, "Motor/Car Service", "Astra Moto", 10, "Expense" },
                    { 35, "Motor/Car Service", "Planet Ban", 10, "Expense" },
                    { 36, "Workstation", "DAPUR PRIM", 10, "Expense" },
                    { 37, "Vet and Dog Supply", "TIMBUL JAY", 10, "Expense" },
                    { 38, "", "transferxx", 10, "Fund Switching" },
                    { 39, "Food", "AYAM KREME", 10, "Expense" },
                    { 40, "Food", "RM ASLI MI", 10, "Expense" },
                    { 41, "Groceries", "GRANDLUCKY", 10, "Expense" },
                    { 42, "Food", "WARKOP AGE", 10, "Expense" },
                    { 43, "Groceries", "Coco Super", 10, "Expense" },
                    { 44, "Food", "WR WAJAR H", 10, "Expense" },
                    { 45, "Bill", "TELKOMSEL", 9, "Expense" },
                    { 46, "Food", "Dimsum GM", 9, "Expense" },
                    { 47, "Food", "RM PADANG", 9, "Expense" },
                    { 48, "Food", "REDDRAGON", 9, "Expense" },
                    { 49, "Groceries", "LAKSMI UD", 9, "Expense" },
                    { 50, "Vet and Dog Supply", "Furbabies", 9, "Expense" },
                    { 51, "Vet and Dog Supply", "EKA PRINT", 9, "Expense" },
                    { 52, "Transfer/Admin Fee", "Biaya Adm", 9, "Expense" },
                    { 53, "Food", "UBI BAKAR", 9, "Expense" },
                    { 54, "Food", "MOTO KOPI", 9, "Expense" },
                    { 55, "Food", "MULARASA", 8, "Expense" },
                    { 56, "Saving Interest", "INTEREST", 8, "Income" },
                    { 57, "Bill", "BCA CARD", 8, "Expense" },
                    { 58, "Food", "Cinnamon", 8, "Expense" },
                    { 59, "Food", "WSS BATU", 8, "Expense" },
                    { 60, "Food", "Jus Masa", 8, "Expense" },
                    { 61, "Food", "MISANTO", 7, "Expense" },
                    { 62, "Food", "KYOUDAI", 7, "Expense" },
                    { 63, "Stock", "1310013", 7, "Saving" },
                    { 64, "Bill", "IZUDDIN", 7, "Expense" },
                    { 65, "Bill", "Netflix", 7, "Expense" },
                    { 66, "Bill", "chatGPT", 7, "Expense" },
                    { 67, "Withdrawing", "Tarikan", 7, "Expense" },
                    { 68, "Food", "Holland", 7, "Expense" },
                    { 69, "Food", "KWETIAU", 7, "Expense" },
                    { 70, "Transfer/Admin Fee", "Charges", 7, "Expense" },
                    { 71, "Food", "LAKLAK", 6, "Expense" },
                    { 72, "Bill", "WIGUNA", 6, "Expense" },
                    { 73, "Food", "Conato", 6, "Expense" },
                    { 74, "Food", "Pepito", 6, "Expense" },
                    { 75, "Entertainment", "PT MNC", 6, "Expense" },
                    { 76, "Food", "INDOMA", 6, "Expense" },
                    { 77, "Food", "Es Teh", 6, "Expense" },
                    { 78, "Food", "Sambal", 6, "Expense" },
                    { 79, "Food", "WARUNG", 6, "Expense" },
                    { 80, "Medical", "Klinik", 6, "Expense" },
                    { 81, "Clothing", "Uniqlo", 6, "Expense" },
                    { 82, "Salary", "K2FLY", 5, "Income" },
                    { 83, "", "CRxxx", 5, "Income" },
                    { 84, "Bill", "Bills", 5, "Expense" },
                    { 85, "Housekeeping", "londri", 6, "Expense" },
                    { 86, "Food", "Yoyok", 5, "Expense" },
                    { 87, "Food", "Bubur", 5, "Expense" },
                    { 88, "Food", "Gohan", 5, "Expense" },
                    { 89, "Food", "Esteh", 5, "Expense" },
                    { 90, "Food", "Donut", 5, "Expense" },
                    { 91, "Food", "BAKMI", 5, "Expense" },
                    { 92, "Food", "Bakso", 5, "Expense" },
                    { 93, "Food", "Pempek", 6, "Expense" },
                    { 94, "Tax", "Pajak", 5, "Expense" },
                    { 95, "Food", "Donat", 5, "Expense" },
                    { 96, "", "nelly", 5, "Fund Switching" },
                    { 97, "Bill", "BPJS", 4, "Expense" },
                    { 98, "Food", "Roti", 4, "Expense" },
                    { 99, "Food", "Nasi", 4, "Expense" },
                    { 100, "Food", "Gogo", 4, "Expense" },
                    { 101, "Groceries", "Arys", 4, "Expense" },
                    { 102, "Food", "Mie", 3, "Expense" },
                    { 103, "Groceries", "ARY", 3, "Expense" },
                    { 104, "Vet and Dog Supply", "PET", 3, "Expense" },
                    { 105, "Vet and Dog Supply", "VET", 3, "Expense" },
                    { 106, "Transfer/Admin Fee", "FEE", 3, "Expense" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 1);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 2);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 3);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 4);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 5);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 7);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 8);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 9);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 10);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 11);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 12);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 13);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 14);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 15);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 16);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 17);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 18);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 19);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 20);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 21);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 22);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 23);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 24);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 25);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 26);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 27);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 28);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 29);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 30);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 31);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 32);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 33);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 34);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 35);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 36);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 37);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 38);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 39);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 40);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 41);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 42);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 43);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 44);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 45);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 46);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 47);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 48);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 49);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 50);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 51);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 52);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 53);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 54);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 55);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 56);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 57);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 58);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 59);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 60);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 61);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 62);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 63);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 64);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 65);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 66);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 67);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 68);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 69);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 70);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 71);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 72);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 73);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 74);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 75);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 76);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 77);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 78);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 79);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 80);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 81);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 82);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 83);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 84);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 85);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 86);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 87);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 88);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 89);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 90);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 91);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 92);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 93);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 94);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 95);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 96);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 97);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 98);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 99);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 100);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 101);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 102);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 103);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 104);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 105);

            migrationBuilder.DeleteData(
                table: "category_rules",
                keyColumn: "id",
                keyValue: 106);
        }
    }
}
