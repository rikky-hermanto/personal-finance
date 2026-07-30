using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PersonalFinance.Domain.Entities.Desk;

/// <summary>
/// Round-trips a jsonb column as a raw JSON string on the entity, without Newtonsoft trying to
/// bind the column's native JSON shape (object/array) directly onto a `string` property.
/// PostgREST returns jsonb columns as native JSON (not a quoted string) — supabase-csharp's
/// ModeledResponse deserializes the whole row with Newtonsoft, so a plain `string` property throws
/// `JsonReaderException: Unexpected character encountered while parsing value: [` the moment the
/// column holds an array or object. This converter reads the raw token back out as text on read,
/// and re-parses the string into a JToken on write so outgoing requests carry real JSON, not a
/// JSON string literal (which would silently corrupt the jsonb column to a scalar string).
/// </summary>
public class RawJsonConverter : JsonConverter<string>
{
    public override string? ReadJson(JsonReader reader, Type objectType, string? existingValue, bool hasExistingValue, JsonSerializer serializer)
    {
        var token = JToken.Load(reader);
        return token.Type == JTokenType.Null ? null : token.ToString(Formatting.None);
    }

    public override void WriteJson(JsonWriter writer, string? value, JsonSerializer serializer)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            writer.WriteNull();
            return;
        }
        JToken.Parse(value).WriteTo(writer);
    }
}
