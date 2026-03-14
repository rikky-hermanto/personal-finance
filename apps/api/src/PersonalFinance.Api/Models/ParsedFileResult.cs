using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Api.Models
{
    internal class ParsedFileResult
    {
        public string FileName { get; internal set; }
        public string Error { get; internal set; }
        public List<Transaction> Transactions { get; internal set; }
    }
}