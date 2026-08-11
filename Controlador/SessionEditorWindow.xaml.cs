using System.Globalization;
using System.Windows;

namespace Controlador;

public partial class SessionEditorWindow : Window
{
    private readonly TimeEntry _entry;

    public SessionEditorWindow(TimeEntry entry)
    {
        _entry = entry;
        InitializeComponent();

        var endedAt = entry.EndedAt ?? DateTime.Now;
        TicketCodeTextBox.Text = entry.TicketCode;
        StartDatePicker.SelectedDate = entry.StartedAt.Date;
        StartTimeTextBox.Text = entry.StartedAt.ToString("HH:mm");
        EndDatePicker.SelectedDate = endedAt.Date;
        EndTimeTextBox.Text = endedAt.ToString("HH:mm");
    }

    public TimeEntry? Result { get; private set; }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        var ticketCode = TicketCodeTextBox.Text.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(ticketCode))
        {
            ShowValidation("Informe o número do chamado.");
            return;
        }

        if (StartDatePicker.SelectedDate is not DateTime startDate ||
            EndDatePicker.SelectedDate is not DateTime endDate ||
            !DateTime.TryParseExact(StartTimeTextBox.Text.Trim(), new[] { "H:mm", "HH:mm" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var startTime) ||
            !DateTime.TryParseExact(EndTimeTextBox.Text.Trim(), new[] { "H:mm", "HH:mm" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var endTime))
        {
            ShowValidation("Use datas válidas e horários no formato HH:mm.");
            return;
        }

        var startedAt = startDate.Date + startTime.TimeOfDay;
        var endedAt = endDate.Date + endTime.TimeOfDay;
        if (endedAt <= startedAt)
        {
            ShowValidation("O horário final precisa ser posterior ao início.");
            return;
        }

        Result = new TimeEntry
        {
            Id = _entry.Id,
            TicketCode = ticketCode,
            StartedAt = startedAt,
            EndedAt = endedAt
        };

        DialogResult = true;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void ShowValidation(string message)
    {
        ValidationText.Text = message;
        ValidationText.Visibility = Visibility.Visible;
    }
}
