using System.Drawing;
using System.Threading;
using System.Windows;
using Forms = System.Windows.Forms;

namespace Controlador;

public partial class App : System.Windows.Application
{
    private Mutex? _singleInstanceMutex;
    private bool _ownsInstanceMutex;
    private Forms.NotifyIcon? _trayIcon;
    private Forms.ContextMenuStrip? _trayMenu;

    public event EventHandler? ShowTimerOverlayRequested;

    public event EventHandler? ShowMainWindowRequested;

    public event EventHandler? TogglePauseResumeRequested;

    protected override void OnStartup(StartupEventArgs e)
    {
        _singleInstanceMutex = new Mutex(true, "Controlador.DiarioDeChamados.SingleInstance", out var createdNew);
        _ownsInstanceMutex = createdNew;

        if (!createdNew)
        {
            MessageBox.Show(
                "O Controlador já está aberto.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        SQLitePCL.raw.SetProvider(new SQLitePCL.SQLite3Provider_winsqlite3());
        SQLitePCL.raw.FreezeProvider();

        base.OnStartup(e);
        CreateTrayIcon();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _trayIcon?.Dispose();
        _trayMenu?.Dispose();

        if (_ownsInstanceMutex)
        {
            _singleInstanceMutex?.ReleaseMutex();
        }

        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }

    private void CreateTrayIcon()
    {
        _trayMenu = new Forms.ContextMenuStrip();
        _trayMenu.Items.Add("Mostrar contador (Ctrl+Shift+T)", null, (_, _) => RaiseOnUiThread(ShowTimerOverlayRequested));
        _trayMenu.Items.Add("Pausar / Retomar (Ctrl+Shift+P)", null, (_, _) => RaiseOnUiThread(TogglePauseResumeRequested));
        _trayMenu.Items.Add("Abrir aplicativo", null, (_, _) => RaiseOnUiThread(ShowMainWindowRequested));
        _trayMenu.Items.Add(new Forms.ToolStripSeparator());
        _trayMenu.Items.Add("Sair", null, (_, _) => Dispatcher.BeginInvoke(() => Shutdown()));

        _trayIcon = new Forms.NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Controlador — diário de chamados",
            Visible = true,
            ContextMenuStrip = _trayMenu
        };
        _trayIcon.MouseDoubleClick += (_, _) => RaiseOnUiThread(ShowTimerOverlayRequested);
    }

    private void RaiseOnUiThread(EventHandler? handler)
    {
        Dispatcher.BeginInvoke(() => handler?.Invoke(this, EventArgs.Empty));
    }

    public static void ApplyTheme(string theme)
    {
        var uri = theme == "dark"
            ? new Uri("Themes/DarkTheme.xaml", UriKind.Relative)
            : new Uri("Themes/LightTheme.xaml", UriKind.Relative);

        var dicts = Current.Resources.MergedDictionaries;
        var existing = dicts.FirstOrDefault(d =>
            d.Source != null &&
            (d.Source.OriginalString.Contains("LightTheme") || d.Source.OriginalString.Contains("DarkTheme")));

        if (existing != null)
        {
            dicts.Remove(existing);
        }

        dicts.Add(new ResourceDictionary { Source = uri });
    }
}
