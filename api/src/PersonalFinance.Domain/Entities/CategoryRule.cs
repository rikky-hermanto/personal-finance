namespace PersonalFinance.Domain.Entities
{
    public class CategoryRule
    {
        public int Id { get; set; }
        public string Keyword { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;

        public int KeywordLength
        {
            get => string.IsNullOrEmpty(Keyword) ? 0 : Keyword.Length;
            set { /* setter for EF or serialization, can be left empty or private if not needed */ }
        }
    }
}