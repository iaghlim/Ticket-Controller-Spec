using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using System.Windows.Threading;

namespace Controlador;

public partial class TimerOverlayWindow : Window
{
    private readonly MainWindow _mainWindow;
    private readonly DispatcherTimer _clock;
    private bool _allowClose;
    private bool _isMiniMode;

    public TimerOverlayWindow(MainWindow mainWindow)
    {
        _mainWindow = mainWindow;
        InitializeComponent();

        _clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _clock.Tick += (_, _) => RefreshTimerState();
        _clock.Start();
    }

    internal void RefreshTimerState()
    {
        var state = _mainWindow.GetTimerOverlayState();

        if (state.ActiveTicketCode is not null && state.StartedAt is DateTime startedAt)
        {
            var duration = DateTime.Now - startedAt;
            var formattedTime = FormatDuration(duration);

            CurrentTicketText.Text = state.ActiveTicketCode;
            TimerText.Text = formattedTime;
            TimerStatusText.Text = $"Gravando desde {startedAt:HH:mm}. Digite outro chamado para trocar.";
            StartSwitchButton.Content = "Trocar";
            PauseResumeButton.Content = "Pausar";
            PauseResumeButton.IsEnabled = true;

            MiniTicketText.Text = state.ActiveTicketCode;
            MiniTimerText.Text = formattedTime;
            MiniPauseResumeButton.Content = "Pausar";
            MiniPauseResumeButton.IsEnabled = true;

            IdleWarningBanner.Visibility = duration >= TimeSpan.FromHours(2)
                ? Visibility.Visible
                : Visibility.Collapsed;
            return;
        }

        TimerText.Text = "00:00:00";
        MiniTimerText.Text = "00:00:00";
        StartSwitchButton.Content = "Gravar";
        IdleWarningBanner.Visibility = Visibility.Collapsed;

        if (string.IsNullOrWhiteSpace(state.LastTicketCode))
        {
            CurrentTicketText.Text = "Nenhum chamado ativo";
            TimerStatusText.Text = "Digite um chamado para começar.";
            PauseResumeButton.Content = "Pausar";
            PauseResumeButton.IsEnabled = false;

            MiniTicketText.Text = "Nenhum ativo";
            MiniPauseResumeButton.Content = "Pausar";
            MiniPauseResumeButton.IsEnabled = false;
            return;
        }

        CurrentTicketText.Text = $"Pausado: {state.LastTicketCode}";
        TimerStatusText.Text = "Retome este chamado ou informe outro para registrar.";
        PauseResumeButton.Content = "Retomar";
        PauseResumeButton.IsEnabled = true;

        MiniTicketText.Text = $"Pausado: {state.LastTicketCode}";
        MiniPauseResumeButton.Content = "Retomar";
        MiniPauseResumeButton.IsEnabled = true;
    }

    internal void FocusTicketInput()
    {
        if (_isMiniMode)
        {
            return;
        }

        Dispatcher.BeginInvoke(() =>
        {
            TicketCodeTextBox.Focus();
            TicketCodeTextBox.SelectAll();
        });
    }

    internal void CloseForApplicationExit()
    {
        _allowClose = true;
        _clock.Stop();
        Close();
    }

    private void TimerOverlayWindow_Loaded(object sender, RoutedEventArgs e)
    {
        RefreshTimerState();
    }

    private void TimerOverlayWindow_Closing(object? sender, CancelEventArgs e)
    {
        if (_allowClose)
        {
            return;
        }

        e.Cancel = true;
        Hide();
    }

    private void DragArea_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private void TicketCodeTextBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter)
        {
            return;
        }

        StartTimerFromInput();
        e.Handled = true;
    }

    private void StartSwitchButton_Click(object sender, RoutedEventArgs e)
    {
        StartTimerFromInput();
    }

    private void PauseResumeButton_Click(object sender, RoutedEventArgs e)
    {
        _mainWindow.PauseOrResumeTimerFromOverlay();
        ClearValidation();
        RefreshTimerState();
    }

    private void OpenMainButton_Click(object sender, RoutedEventArgs e)
    {
        _mainWindow.BringMainWindowToFront();
    }

    private void HideToTrayButton_Click(object sender, RoutedEventArgs e)
    {
        Hide();
    }

    private void MiniModeToggleButton_Click(object sender, RoutedEventArgs e)
    {
        _isMiniMode = !_isMiniMode;

        if (_isMiniMode)
        {
            NormalPanel.Visibility = Visibility.Collapsed;
            MiniPanel.Visibility = Visibility.Visible;
            MiniModeToggleButton.Content = "Expandir";
            HeaderSubtitleText.Text = "modo mini";
            Height = 85;
            Width = 300;
        }
        else
        {
            MiniPanel.Visibility = Visibility.Collapsed;
            NormalPanel.Visibility = Visibility.Visible;
            MiniModeToggleButton.Content = "Mini";
            HeaderSubtitleText.Text = "contador flutuante";
            Height = 275;
            Width = 360;
        }
    }

    private void StartTimerFromInput()
    {
        if (!_mainWindow.TryStartTicketFromOverlay(TicketCodeTextBox.Text, out var validationMessage))
        {
            ShowValidation(validationMessage);
            TicketCodeTextBox.Focus();
            return;
        }

        TicketCodeTextBox.Clear();
        ClearValidation();
        RefreshTimerState();
    }

    private void ShowValidation(string message)
    {
        ValidationText.Text = message;
        ValidationText.Visibility = Visibility.Visible;
    }

    private void ClearValidation()
    {
        ValidationText.Text = string.Empty;
        ValidationText.Visibility = Visibility.Collapsed;
    }

    private static string FormatDuration(TimeSpan duration)
    {
        var safeDuration = duration < TimeSpan.Zero ? TimeSpan.Zero : duration;
        return $"{(int)safeDuration.TotalHours:00}:{safeDuration.Minutes:00}:{safeDuration.Seconds:00}";
    }
}
