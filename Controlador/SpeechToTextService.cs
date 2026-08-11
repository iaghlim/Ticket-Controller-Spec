using System.IO;
using System.Text;
using Whisper.net;
using Whisper.net.Ggml;

namespace Controlador;

internal static class SpeechToTextService
{
    private static readonly SemaphoreSlim DownloadLock = new(1, 1);

    /// <summary>
    /// Transcribes the given WAV file to text in Portuguese using local Whisper.net model.
    /// Downloads the ggml-base model automatically if not already present.
    /// </summary>
    public static async Task<string> TranscribeAsync(string wavFilePath, string modelsDirectory, Action<string>? statusCallback = null, string language = "pt")
    {
        if (!File.Exists(wavFilePath))
        {
            return string.Empty;
        }

        Directory.CreateDirectory(modelsDirectory);
        var modelPath = Path.Combine(modelsDirectory, "ggml-base.bin");

        await EnsureModelDownloadedAsync(modelPath, statusCallback);

        statusCallback?.Invoke("Transcrevendo áudio localmente...");

        using var whisperFactory = WhisperFactory.FromPath(modelPath);
        using var processor = whisperFactory.CreateBuilder()
            .WithLanguage(language)
            .Build();

        using var fileStream = File.OpenRead(wavFilePath);
        var textBuilder = new StringBuilder();

        await foreach (var result in processor.ProcessAsync(fileStream))
        {
            if (!string.IsNullOrWhiteSpace(result.Text))
            {
                textBuilder.Append(result.Text.Trim()).Append(' ');
            }
        }

        return textBuilder.ToString().Trim();
    }

    private static async Task EnsureModelDownloadedAsync(string modelPath, Action<string>? statusCallback)
    {
        if (File.Exists(modelPath))
        {
            return;
        }

        await DownloadLock.WaitAsync();
        try
        {
            if (File.Exists(modelPath))
            {
                return;
            }

            statusCallback?.Invoke("Baixando modelo de transcrição local (ggml-base.bin)...");

            var tempPath = modelPath + ".tmp";

            using (var modelStream = await WhisperGgmlDownloader.GetGgmlModelAsync(GgmlType.Base))
            using (var fileStream = File.Create(tempPath))
            {
                await modelStream.CopyToAsync(fileStream);
            }

            File.Move(tempPath, modelPath, overwrite: true);
            statusCallback?.Invoke("Modelo carregado com sucesso.");
        }
        finally
        {
            DownloadLock.Release();
        }
    }
}
