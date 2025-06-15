using System.Text;

public class BankIdentifier : IBankIdentifier
{
    public async Task<string?> IdentifyAsync(Stream stream, string contentType)
    {
        if (contentType == "text/csv")
        {
            stream.Position = 0;
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024);
            for (int i = 0; i < 5; i++)
            {
                var line = await reader.ReadLineAsync();
                if (line == null) break;
                if (line.Contains("Tanggal,Keterangan,Cabang,Jumlah,,Saldo", StringComparison.OrdinalIgnoreCase))
                {
                    stream.Position = 0;
                    return "BCA";
                }
            }
            stream.Position = 0;
        }
        // Add more bank detection logic here as needed
        return null;
    }
}