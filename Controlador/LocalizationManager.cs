using System.Windows;

namespace Controlador;

public static class LocalizationManager
{
    public static string CurrentLanguage { get; private set; } = "pt";

    public static event EventHandler? LanguageChanged;

    public static void ApplyLanguage(string language)
    {
        var lang = language.ToLowerInvariant() switch
        {
            "en" => "en",
            "es" => "es",
            _ => "pt"
        };

        CurrentLanguage = lang;

        var uri = new Uri($"Locales/Strings.{lang}.xaml", UriKind.Relative);
        var dicts = Application.Current.Resources.MergedDictionaries;

        var existing = dicts.FirstOrDefault(d =>
            d.Source != null && d.Source.OriginalString.Contains("Strings."));

        if (existing != null)
        {
            dicts.Remove(existing);
        }

        dicts.Add(new ResourceDictionary { Source = uri });
        LanguageChanged?.Invoke(null, EventArgs.Empty);
    }

    public static string GetString(string resourceKey)
    {
        return Application.Current.TryFindResource(resourceKey)?.ToString() ?? resourceKey;
    }
}
