using System.Windows;

namespace Controlador;

public partial class InsightsWindow : Window
{
    private readonly LocalStore _store;

    public InsightsWindow(LocalStore store)
    {
        _store = store;
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        var allEntries = _store.QueryAllTimeEntries();
        var now = DateTime.Now;
        var thirtyDaysAgo = now.Date.AddDays(-30);
        var entries30d = allEntries.Where(e => e.StartedAt >= thirtyDaysAgo).ToList();
        var finishedEntries = allEntries.Where(e => e.EndedAt.HasValue).ToList();

        // ── Totals ──────────────────────────────────────────────────────────
        var totalTime = finishedEntries.Aggregate(TimeSpan.Zero, (t, e) => t + (e.EndedAt!.Value - e.StartedAt));
        TotalHoursText.Text = FormatShortDuration(totalTime);
        TotalTicketsText.Text = allEntries.Select(e => e.TicketCode).Distinct(StringComparer.OrdinalIgnoreCase).Count().ToString();
        TotalSessionsText.Text = finishedEntries.Count.ToString();

        // ── Averages (last 30 days) ─────────────────────────────────────────
        var activeDays30 = entries30d
            .Where(e => e.EndedAt.HasValue)
            .Select(e => e.StartedAt.Date)
            .Distinct()
            .Count();

        if (activeDays30 > 0)
        {
            var finished30d = entries30d.Where(e => e.EndedAt.HasValue).ToList();
            var time30d = finished30d.Aggregate(TimeSpan.Zero, (t, e) => t + (e.EndedAt!.Value - e.StartedAt));

            AvgHoursPerDayText.Text = FormatShortDuration(TimeSpan.FromHours(time30d.TotalHours / activeDays30));
            AvgTicketsPerDayText.Text = $"{entries30d.Select(e => e.TicketCode).Distinct(StringComparer.OrdinalIgnoreCase).Count() / (double)activeDays30:0.#}";
            AvgSessionsPerDayText.Text = $"{finished30d.Count / (double)activeDays30:0.#}";
            AvgSessionDurationText.Text = finished30d.Count > 0
                ? FormatShortDuration(TimeSpan.FromMinutes(time30d.TotalMinutes / finished30d.Count))
                : "—";
        }

        // ── Patterns ────────────────────────────────────────────────────────
        var byDayOfWeek = finishedEntries
            .GroupBy(e => e.StartedAt.DayOfWeek)
            .Select(g => new
            {
                Day = g.Key,
                TotalHours = g.Sum(e => (e.EndedAt!.Value - e.StartedAt).TotalHours)
            })
            .OrderByDescending(x => x.TotalHours)
            .FirstOrDefault();

        if (byDayOfWeek is not null)
        {
            var dayNames = new[] { "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado" };
            BestDayText.Text = dayNames[(int)byDayOfWeek.Day];
        }

        var byHour = finishedEntries
            .GroupBy(e => e.StartedAt.Hour)
            .Select(g => new { Hour = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .FirstOrDefault();

        if (byHour is not null)
        {
            PeakHourText.Text = $"{byHour.Hour:00}:00–{byHour.Hour + 1:00}:00";
        }

        // This week / last week
        var todayDate = now.Date;
        var daysSinceMonday = ((int)todayDate.DayOfWeek + 6) % 7;
        var thisWeekStart = todayDate.AddDays(-daysSinceMonday);
        var lastWeekStart = thisWeekStart.AddDays(-7);

        var thisWeekTime = finishedEntries
            .Where(e => e.StartedAt >= thisWeekStart)
            .Aggregate(TimeSpan.Zero, (t, e) => t + ClampDuration(e, thisWeekStart, now));

        var lastWeekTime = finishedEntries
            .Where(e => e.StartedAt >= lastWeekStart && e.StartedAt < thisWeekStart)
            .Aggregate(TimeSpan.Zero, (t, e) => t + ClampDuration(e, lastWeekStart, thisWeekStart));

        ThisWeekText.Text = FormatShortDuration(thisWeekTime);
        LastWeekText.Text = FormatShortDuration(lastWeekTime);

        // ── Top tickets (30 days) ───────────────────────────────────────────
        var topTickets = entries30d
            .Where(e => e.EndedAt.HasValue)
            .GroupBy(e => e.TicketCode, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                Code = g.Key,
                Duration = g.Aggregate(TimeSpan.Zero, (t, e) => t + (e.EndedAt!.Value - e.StartedAt)),
                SessionCount = g.Count()
            })
            .OrderByDescending(x => x.Duration)
            .Take(10)
            .Select((x, i) => new TopTicketRow
            {
                Rank = $"#{i + 1}",
                Code = x.Code,
                Duration = FormatShortDuration(x.Duration),
                SessionInfo = $"{x.SessionCount} sessão{(x.SessionCount == 1 ? "" : "ões")}"
            })
            .ToList();

        if (topTickets.Count == 0)
        {
            NoTicketsText.Visibility = Visibility.Visible;
            TopTicketsList.Visibility = Visibility.Collapsed;
        }
        else
        {
            TopTicketsList.ItemsSource = topTickets;
        }
    }

    private static TimeSpan ClampDuration(TimeEntry entry, DateTime start, DateTime end)
    {
        var s = entry.StartedAt < start ? start : entry.StartedAt;
        var e2 = entry.EndedAt!.Value > end ? end : entry.EndedAt!.Value;
        return e2 > s ? e2 - s : TimeSpan.Zero;
    }

    private static string FormatShortDuration(TimeSpan d)
    {
        var safe = d < TimeSpan.Zero ? TimeSpan.Zero : d;
        return $"{(int)safe.TotalHours}h {safe.Minutes:00}m";
    }
}

internal sealed class TopTicketRow
{
    public string Rank { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public string Duration { get; init; } = string.Empty;
    public string SessionInfo { get; init; } = string.Empty;
}
