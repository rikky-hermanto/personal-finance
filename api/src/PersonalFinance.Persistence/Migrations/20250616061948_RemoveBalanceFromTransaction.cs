using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveBalanceFromTransaction : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "balance",
                table: "transactions");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "balance",
                table: "transactions",
                type: "numeric",
                nullable: true);
        }
    }
}
