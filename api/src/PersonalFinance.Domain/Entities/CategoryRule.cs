namespace PersonalFinance.Domain.Entities
{
    public class CategoryRule
    {
        public int Id { get; set; }
        public string Keyword { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public int KeywordLength { get; set; }
    }
}