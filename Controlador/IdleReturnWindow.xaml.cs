using System.Windows;
using System.Windows.Controls;

namespace Controlador;

public enum IdleReturnAction { Keep, Discard, Move }

public sealed class IdleReturnResult
{
    public IdleReturnAction Action { get; init; }
    public string? MoveToTicketCode { get; init; }
}

public partial class IdleReturnWindow : Window
{
    private readonly TimeSpan _idleDuration;
    private readonly DateTime _idleStartedAt;
    private readonly string _activeTicketCode;

    public IdleReturnResult? Result { get; private set; }

    public IdleReturnWindow(string activeTicketCode, DateTime idleStartedAt, TimeSpan idleDuration)
    {
        _activeTicketCode = activeTicketCode;
        _idleStartedAt = idleStartedAt;
        _idleDuration = idleDuration;
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        var minutes = (int)_idleDuration.TotalMinutes;
        HeadlineText.Text = $"Você ficou ausente por {minutes} minuto{(minutes == 1 ? "" : "s")}";
        SubtitleText.Text = $"Chamado ativo: {_activeTicketCode}  ·  Ausente desde {_idleStartedAt:HH:mm}";

        MoveRadio.Checked += (_, _) =>
        {
            MoveToTicketTextBox.IsEnabled = true;
            MoveToTicketTextBox.Focus();
        };

        KeepRadio.Checked += (_, _) => MoveToTicketTextBox.IsEnabled = false;
        DiscardRadio.Checked += (_, _) => MoveToTicketTextBox.IsEnabled = false;
    }

    private void ConfirmButton_Click(object sender, RoutedEventArgs e)
    {
        if (MoveRadio.IsChecked == true)
        {
            var code = MoveToTicketTextBox.Text.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(code))
            {
                MoveToTicketTextBox.Focus();
                return;
            }
            Result = new IdleReturnResult { Action = IdleReturnAction.Move, MoveToTicketCode = code };
        }
        else if (DiscardRadio.IsChecked == true)
        {
            Result = new IdleReturnResult { Action = IdleReturnAction.Discard };
        }
        else
        {
            Result = new IdleReturnResult { Action = IdleReturnAction.Keep };
        }

        DialogResult = true;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        Result = new IdleReturnResult { Action = IdleReturnAction.Keep };
        DialogResult = false;
    }
}
