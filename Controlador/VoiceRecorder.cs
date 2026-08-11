using System.IO;
using NAudio.Wave;

namespace Controlador;

/// <summary>
/// Records audio from the default microphone and saves it as a WAV file.
/// Dispose to release all resources; call StopRecording() first to flush the file.
/// </summary>
internal sealed class VoiceRecorder : IDisposable
{
    private WaveInEvent? _waveIn;
    private WaveFileWriter? _waveWriter;
    private bool _disposed;

    public bool IsRecording { get; private set; }

    /// <summary>
    /// Starts recording to the specified WAV file path.
    /// If already recording, this is a no-op.
    /// </summary>
    public void StartRecording(string outputPath)
    {
        if (IsRecording || _disposed)
        {
            return;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

        _waveIn = new WaveInEvent
        {
            WaveFormat = new WaveFormat(16000, 16, 1)
        };

        _waveWriter = new WaveFileWriter(outputPath, _waveIn.WaveFormat);

        _waveIn.DataAvailable += (_, e) =>
        {
            _waveWriter?.Write(e.Buffer, 0, e.BytesRecorded);
        };

        _waveIn.RecordingStopped += (_, _) =>
        {
            FlushAndClose();
        };

        _waveIn.StartRecording();
        IsRecording = true;
    }

    /// <summary>
    /// Stops recording and flushes the WAV file. Blocks until the file is fully written.
    /// </summary>
    public void StopRecording()
    {
        if (!IsRecording || _waveIn is null)
        {
            return;
        }

        IsRecording = false;
        _waveIn.StopRecording();
    }

    private void FlushAndClose()
    {
        _waveWriter?.Dispose();
        _waveWriter = null;

        _waveIn?.Dispose();
        _waveIn = null;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (IsRecording)
        {
            IsRecording = false;
            _waveIn?.StopRecording();
        }

        FlushAndClose();
    }
}
