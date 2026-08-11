using System.Runtime.InteropServices;

namespace Controlador;

/// <summary>
/// Detects how long the user has been idle (no keyboard or mouse input).
/// Uses the Win32 GetLastInputInfo API.
/// </summary>
internal static class IdleDetector
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    /// <summary>
    /// Returns the amount of time the system has been idle (no keyboard/mouse input).
    /// </summary>
    public static TimeSpan GetIdleTime()
    {
        var info = new LASTINPUTINFO();
        info.cbSize = (uint)Marshal.SizeOf(info);

        if (!GetLastInputInfo(ref info))
        {
            return TimeSpan.Zero;
        }

        var idleMilliseconds = (uint)Environment.TickCount - info.dwTime;
        return TimeSpan.FromMilliseconds(idleMilliseconds);
    }
}
