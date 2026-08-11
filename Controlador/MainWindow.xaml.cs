using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Interop;
using Microsoft.Data.Sqlite;
using Microsoft.Win32;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using System.Windows.Threading;

namespace Controlador;

public partial class MainWindow : Window
{
    private static readonly IReadOnlyList<DocumentDefinition> DocumentDefinitions =
    [
        new("estimate", "Estimativa", "Esforço, prazo ou detalhamento de horas."),
        new("functional-spec", "Especificação Funcional", "Processo, requisitos e regras funcionais."),
        new("technical-spec", "Especificação Técnica", "Solução técnica, objetos e integrações."),
        new("unit-tests", "Testes Unitários", "Roteiro, resultado e evidências de teste."),
        new("other", "Outros anexos", "Arquivos de apoio sem uma categoria específica.")
    ];

    private readonly DispatcherTimer _clock;
    private readonly LocalStore _store;
    private AppData _data;
    private bool _isRefreshingTicketList;
    private bool _isLoadingTicketDetails;
    private bool _isAdjustingPeriodControls;
    private bool _periodControlsReady;
    private int _secondsSinceCheckpoint;
    private string? _selectedTicketCode;
    private TimerOverlayWindow? _timerOverlay;
    private DateTime _periodStart = DateTime.Today;
    private DateTime _periodEndExclusive = DateTime.Today.AddDays(1);
    private PeriodPreset _activePeriodPreset = PeriodPreset.Today;
    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private const int HOTKEY_ID_OVERLAY = 9001;
    private const int HOTKEY_ID_PAUSE = 9002;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint VK_T = 0x54;
    private const uint VK_P = 0x50;
    private HwndSource? _hwndSource;

    // Idle detection
    private bool _wasIdle;
    private DateTime _idleStartedAt;
    private static readonly TimeSpan IdleThreshold = TimeSpan.FromMinutes(10);

    // Voice recorder
    private VoiceRecorder? _voiceRecorder;

    public MainWindow()
    {
        InitializeComponent();

        _store = new LocalStore();
        _data = _store.Load();
        InitializePeriodFilter();
        var recoveryNotice = RecoverUnfinishedEntries();

        _clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _clock.Tick += Clock_Tick;
        _clock.Start();

        // Apply saved theme and language
        App.ApplyTheme(_data.Theme ?? "light");
        ThemeToggleButton.Content = _data.Theme == "dark" ? "☀️" : "🌙";
        LocalizationManager.ApplyLanguage(_data.Language ?? "pt");
        SetLanguageComboBoxSelection(_data.Language ?? "pt");

        Closing += MainWindow_Closing;
        Loaded += MainWindow_Loaded_Hotkeys;
        var application = (App)Application.Current;
        application.ShowTimerOverlayRequested += App_ShowTimerOverlayRequested;
        application.ShowMainWindowRequested += App_ShowMainWindowRequested;
        application.TogglePauseResumeRequested += App_TogglePauseResumeRequested;
        RefreshAll();
        SetStatus(recoveryNotice ?? "Tudo é salvo apenas neste computador.");
        TicketInputTextBox.Focus();
    }

    private void Clock_Tick(object? sender, EventArgs e)
    {
        RefreshActivePanel();
        RefreshPeriodSummary();

        // Idle detection: check every tick
        var idleTime = IdleDetector.GetIdleTime();
        if (idleTime >= IdleThreshold)
        {
            if (!_wasIdle)
            {
                _wasIdle = true;
                _idleStartedAt = DateTime.Now - idleTime;
            }
        }
        else if (_wasIdle)
        {
            // User just returned from idle
            _wasIdle = false;
            var activeEntry = GetActiveEntry();
            if (activeEntry is not null)
            {
                HandleIdleReturn(activeEntry, _idleStartedAt, idleTime + (DateTime.Now - (DateTime.Now - idleTime)));
            }
        }

        if (GetActiveEntry() is null)
        {
            _secondsSinceCheckpoint = 0;
            return;
        }

        _secondsSinceCheckpoint++;
        if (_secondsSinceCheckpoint >= 30)
        {
            PersistDocumentationFromControls();
            TrySaveState(showError: false);
            _secondsSinceCheckpoint = 0;
        }
    }

    private void ShowTimerOverlayButton_Click(object sender, RoutedEventArgs e)
    {
        ShowTimerOverlay();
    }

    private void App_ShowTimerOverlayRequested(object? sender, EventArgs e)
    {
        ShowTimerOverlay();
    }

    private void App_ShowMainWindowRequested(object? sender, EventArgs e)
    {
        BringMainWindowToFront();
    }

    private void MainWindow_Loaded_Hotkeys(object sender, RoutedEventArgs e)
    {
        var helper = new WindowInteropHelper(this);
        _hwndSource = HwndSource.FromHwnd(helper.Handle);
        _hwndSource?.AddHook(HwndProc);

        RegisterHotKey(helper.Handle, HOTKEY_ID_OVERLAY, MOD_CONTROL | MOD_SHIFT, VK_T);
        RegisterHotKey(helper.Handle, HOTKEY_ID_PAUSE, MOD_CONTROL | MOD_SHIFT, VK_P);
    }

    private IntPtr HwndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == 0x0312)
        {
            var id = wParam.ToInt32();
            if (id == HOTKEY_ID_OVERLAY)
            {
                ShowTimerOverlay();
                handled = true;
            }
            else if (id == HOTKEY_ID_PAUSE)
            {
                PauseOrResumeTimer();
                _timerOverlay?.RefreshTimerState();
                handled = true;
            }
        }

        return IntPtr.Zero;
    }

    private void App_TogglePauseResumeRequested(object? sender, EventArgs e)
    {
        PauseOrResumeTimer();
        _timerOverlay?.RefreshTimerState();
    }

    private void CopyTimesheetButton_Click(object sender, RoutedEventArgs e)
    {
        var entries = GetEntriesOverlappingPeriod();
        if (entries.Count == 0)
        {
            SetStatus("Nenhum registro de horas no período selecionado.");
            return;
        }

        var builder = new StringBuilder();
        builder.AppendLine($"Resumo de Horas ({_periodStart:dd/MM/yyyy} - {_periodEndExclusive.AddDays(-1):dd/MM/yyyy}):");
        builder.AppendLine();

        var totalTime = TimeSpan.Zero;
        var entriesByTicket = entries
            .GroupBy(entry => entry.TicketCode, StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key);

        foreach (var group in entriesByTicket)
        {
            var ticketCode = group.Key;
            var ticketTime = group.Aggregate(TimeSpan.Zero, (sum, entry) => sum + GetDurationWithinRange(entry, _periodStart, _periodEndExclusive));
            totalTime += ticketTime;

            var ticket = FindTicket(ticketCode);
            var title = !string.IsNullOrWhiteSpace(ticket?.Context)
                ? ticket.Context.Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()
                : "Trabalho em chamado";

            builder.AppendLine($"• [{ticketCode}] {FormatShortDuration(ticketTime)} - {title}");
        }

        builder.AppendLine();
        builder.AppendLine($"Total do Período: {FormatDuration(totalTime)} ({FormatShortDuration(totalTime)})");

        Clipboard.SetText(builder.ToString());
        SetStatus("Resumo formatado do timesheet copiado para a área de transferência!");
    }

    private void ExportTicketReportButton_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            SetStatus("Selecione um chamado para exportar o relatório.");
            return;
        }

        var ticket = FindTicket(_selectedTicketCode);
        if (ticket is null)
        {
            SetStatus("Chamado não encontrado.");
            return;
        }

        PersistDocumentationFromControls();

        var totalDuration = GetDurationForTicket(ticket.Code);

        var builder = new StringBuilder();
        builder.AppendLine($"# Dossiê do Chamado: {ticket.Code}");
        builder.AppendLine($"**Gerado em:** {DateTime.Now:dd/MM/yyyy HH:mm}");
        builder.AppendLine($"**Tempo Total Registrado:** {FormatDuration(totalDuration)} ({FormatShortDuration(totalDuration)})");
        builder.AppendLine();

        AppendSection(builder, "Contexto / Entendimento do Problema", ticket.Context);
        AppendSection(builder, "Análise Técnica", ticket.Analysis);
        AppendSection(builder, "Atividades Executadas", ticket.Actions);
        AppendSection(builder, "Solução / Documentação", ticket.Solution);
        AppendSection(builder, "Testes e Evidências", ticket.Tests);
        AppendSection(builder, "Pendências / Próximos Passos", ticket.Pending);

        if (ticket.Notes.Count > 0)
        {
            builder.AppendLine("## Histórico de Notas");
            foreach (var note in ticket.Notes.OrderByDescending(n => n.CreatedAt))
            {
                builder.AppendLine($"- **[{note.CreatedAt:dd/MM/yyyy HH:mm}]**: {note.Text}");
            }
            builder.AppendLine();
        }

        if (ticket.Attachments.Count > 0)
        {
            builder.AppendLine("## Anexos Associados");
            foreach (var att in ticket.Attachments.OrderByDescending(a => a.AddedAt))
            {
                builder.AppendLine($"- {att.OriginalFileName} ({att.DocumentType} · {FormatFileSize(att.SizeBytes)})");
            }
            builder.AppendLine();
        }

        Clipboard.SetText(builder.ToString());
        SetStatus($"Dossiê completo de {ticket.Code} copiado para a área de transferência!");
    }

    private static void AppendSection(StringBuilder builder, string title, string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return;
        }

        builder.AppendLine($"## {title}");
        builder.AppendLine(content.Trim());
        builder.AppendLine();
    }

    private void InsertAnalysisTemplateButton_Click(object sender, RoutedEventArgs e)
    {
        AppendTemplateToTextBox(AnalysisTextBox, """
            ## Objetos Impactados
            - Transação/Programa: 
            - Tabelas/BAdIs/Enhancements: 

            ## Causa Raiz
            - 

            ## Diagnóstico Técnico
            - 
            """);
    }

    private void InsertSolutionTemplateButton_Click(object sender, RoutedEventArgs e)
    {
        AppendTemplateToTextBox(SolutionTextBox, """
            ## Alterações Realizadas
            - 

            ## Configurações / Dependências
            - 

            ## Instruções de Transporte / Deploy
            - 
            """);
    }

    private void InsertTestsTemplateButton_Click(object sender, RoutedEventArgs e)
    {
        AppendTemplateToTextBox(TestsTextBox, """
            ## Roteiro de Testes
            1. Executar transação/tela: 
            2. Informar dados de entrada: 
            3. Resultado Esperado: 

            ## Evidências
            - Testado com sucesso em ambiente de QAS.
            """);
    }

    private static void AppendTemplateToTextBox(TextBox textBox, string template)
    {
        if (string.IsNullOrWhiteSpace(textBox.Text))
        {
            textBox.Text = template;
        }
        else
        {
            textBox.Text = textBox.Text.TrimEnd() + "\n\n" + template;
        }

        textBox.Focus();
        textBox.SelectionStart = textBox.Text.Length;
    }

    private static bool MatchesFilter(Ticket ticket, string filter)
    {
        if (string.IsNullOrWhiteSpace(filter))
        {
            return true;
        }

        return ticket.Code.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
               ticket.Context.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
               ticket.Analysis.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
               ticket.Actions.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
               ticket.Solution.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
               ticket.Tests.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
               ticket.Pending.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
               ticket.Notes.Any(n => n.Text.Contains(filter, StringComparison.OrdinalIgnoreCase));
    }

    private void ShowTimerOverlay()
    {
        _timerOverlay ??= new TimerOverlayWindow(this);
        _timerOverlay.RefreshTimerState();

        if (!_timerOverlay.IsVisible)
        {
            _timerOverlay.Show();
        }

        if (_timerOverlay.WindowState == WindowState.Minimized)
        {
            _timerOverlay.WindowState = WindowState.Normal;
        }

        _timerOverlay.Activate();
        _timerOverlay.FocusTicketInput();
    }

    internal void BringMainWindowToFront()
    {
        if (!IsVisible)
        {
            Show();
        }

        if (WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Normal;
        }

        Activate();
    }

    private void StartSwitchButton_Click(object sender, RoutedEventArgs e)
    {
        StartFromInput();
    }

    private void TicketInputTextBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter)
        {
            return;
        }

        StartFromInput();
        e.Handled = true;
    }

    private void PauseResumeButton_Click(object sender, RoutedEventArgs e)
    {
        PauseOrResumeTimer();
    }

    private void PauseOrResumeTimer()
    {
        PersistDocumentationFromControls();
        var activeEntry = GetActiveEntry();

        if (activeEntry is not null)
        {
            EndEntry(activeEntry, DateTime.Now);
            TrySaveState();
            RefreshAll();
            SetStatus($"{activeEntry.TicketCode} foi pausado. Você pode retomá-lo quando quiser.");
            return;
        }

        if (string.IsNullOrWhiteSpace(_data.LastTicketCode))
        {
            SetStatus("Não há um chamado pausado para retomar.");
            return;
        }

        StartTicket(_data.LastTicketCode, isResume: true);
    }

    private void FinishDayButton_Click(object sender, RoutedEventArgs e)
    {
        PersistDocumentationFromControls();
        var activeEntry = GetActiveEntry();

        if (activeEntry is not null)
        {
            EndEntry(activeEntry, DateTime.Now);
        }

        _data.LastTicketCode = null;
        TrySaveState();
        RefreshAll();
        SetStatus("Dia finalizado. Seus registros foram salvos localmente.");
    }

    internal void PauseOrResumeTimerFromOverlay()
    {
        PauseOrResumeTimer();
    }

    private void AddQuickNoteButton_Click(object sender, RoutedEventArgs e)
    {
        var text = QuickNoteTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            SetStatus("Escreva uma nota antes de salvar.");
            return;
        }

        var ticketCode = GetActiveEntry()?.TicketCode ?? _selectedTicketCode;
        if (string.IsNullOrWhiteSpace(ticketCode))
        {
            MessageBox.Show(
                "Inicie ou selecione um chamado antes de adicionar uma nota.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        var ticket = GetOrCreateTicket(ticketCode);
        ticket.Notes.Add(new TicketNote
        {
            CreatedAt = DateTime.Now,
            Text = text
        });
        ticket.UpdatedAt = DateTime.Now;

        QuickNoteTextBox.Clear();
        _selectedTicketCode = ticket.Code;
        TrySaveState();
        RefreshAll();
        SetStatus($"Nota salva em {ticket.Code}.");
    }

    private void TicketSearchTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_isRefreshingTicketList)
        {
            return;
        }

        if (PersistDocumentationFromControls())
        {
            TrySaveState(showError: false);
        }

        RefreshTicketList();
    }

    private void TicketList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_isRefreshingTicketList)
        {
            return;
        }

        if (PersistDocumentationFromControls())
        {
            TrySaveState(showError: false);
        }

        if (TicketList.SelectedItem is TicketListItem item)
        {
            _selectedTicketCode = item.Code;
            DisplayTicketDetails(item.Code);
            return;
        }

        _selectedTicketCode = null;
        ClearTicketDetails();
    }

    private void SaveDocumentationButton_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            SetStatus("Selecione um chamado para salvar a documentação.");
            return;
        }

        var changed = PersistDocumentationFromControls();
        TrySaveState();
        RefreshTicketList();
        DisplayTicketDetails(_selectedTicketCode);
        SetStatus(changed ? "Documentação salva." : "Não houve alterações para salvar.");
    }

    private void EditSelectedSessionButton_Click(object sender, RoutedEventArgs e)
    {
        if (TodayEntriesGrid.SelectedItem is not SessionRow row)
        {
            MessageBox.Show(
                "Selecione uma sessão no resumo do dia para corrigi-la.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        var entry = _data.TimeEntries.FirstOrDefault(item => item.Id == row.EntryId);
        if (entry is null)
        {
            SetStatus("A sessão selecionada não foi encontrada.");
            return;
        }

        if (entry.EndedAt is null)
        {
            MessageBox.Show(
                "Pause ou finalize o chamado antes de corrigir a sessão em andamento.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        var editor = new SessionEditorWindow(entry) { Owner = this };
        if (editor.ShowDialog() != true || editor.Result is null)
        {
            return;
        }

        var correction = editor.Result;
        entry.TicketCode = correction.TicketCode;
        entry.StartedAt = correction.StartedAt;
        entry.EndedAt = correction.EndedAt;
        GetOrCreateTicket(entry.TicketCode).UpdatedAt = DateTime.Now;
        _selectedTicketCode = entry.TicketCode;

        TrySaveState();
        RefreshAll();
        SetStatus("Sessão corrigida.");
    }

    private void DeleteSelectedSessionButton_Click(object sender, RoutedEventArgs e)
    {
        if (TodayEntriesGrid.SelectedItem is not SessionRow row)
        {
            MessageBox.Show(
                "Selecione uma sessão na lista para excluir.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        var entry = _data.TimeEntries.FirstOrDefault(item => item.Id == row.EntryId);
        if (entry is null)
        {
            SetStatus("A sessão selecionada não foi encontrada.");
            return;
        }

        if (entry.EndedAt is null)
        {
            MessageBox.Show(
                "Pause o chamado ativo antes de excluir a sessão em andamento.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        var confirmation = MessageBox.Show(
            $"Excluir a sessão de {entry.TicketCode} ({row.StartedAt} – {row.EndedAt})?",
            "Excluir sessão",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);

        if (confirmation != MessageBoxResult.Yes)
        {
            return;
        }

        _data.TimeEntries.Remove(entry);
        TrySaveState();
        RefreshAll();
        SetStatus($"Sessão de {entry.TicketCode} excluída.");
    }

    private void DeleteSelectedTicketButton_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            SetStatus("Selecione um chamado para excluir.");
            return;
        }

        var ticket = FindTicket(_selectedTicketCode);
        if (ticket is null)
        {
            SetStatus("Chamado não encontrado.");
            return;
        }

        var activeEntry = GetActiveEntry();
        if (activeEntry is not null && string.Equals(activeEntry.TicketCode, _selectedTicketCode, StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(
                "Pause ou finalize o chamado ativo antes de excluí-lo.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        var sessionCount = _data.TimeEntries.Count(e => string.Equals(e.TicketCode, _selectedTicketCode, StringComparison.OrdinalIgnoreCase));
        var confirmation = MessageBox.Show(
            $"Excluir o chamado {ticket.Code} permanentemente?\n\n" +
            $"Isso removerá {sessionCount} sessão(ões), {ticket.Notes.Count} nota(s), {ticket.Attachments.Count} anexo(s) e todos os arquivos copiados.\n\n" +
            "Esta ação não pode ser desfeita.",
            "Excluir chamado",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);

        if (confirmation != MessageBoxResult.Yes)
        {
            return;
        }

        // Remove physical attachment files
        foreach (var att in ticket.Attachments)
        {
            try { _store.DeleteAttachment(att.StoredRelativePath); } catch (IOException) { }
        }

        _data.TimeEntries.RemoveAll(e => string.Equals(e.TicketCode, _selectedTicketCode, StringComparison.OrdinalIgnoreCase));
        _data.Tickets.Remove(ticket);
        if (string.Equals(_data.LastTicketCode, _selectedTicketCode, StringComparison.OrdinalIgnoreCase))
        {
            _data.LastTicketCode = null;
        }

        _selectedTicketCode = null;
        TrySaveState();
        RefreshAll();
        SetStatus($"Chamado {ticket.Code} excluído.");
    }

    private void ExportCsvButton_Click(object sender, RoutedEventArgs e)
    {
        var entries = GetEntriesOverlappingPeriod();
        if (entries.Count == 0)
        {
            SetStatus("Nenhum registro de horas no período selecionado.");
            return;
        }

        var dialog = new SaveFileDialog
        {
            Title = "Exportar sessões como CSV",
            Filter = "Arquivo CSV (*.csv)|*.csv",
            DefaultExt = ".csv",
            AddExtension = true,
            OverwritePrompt = true,
            FileName = $"controlador-{_periodStart:yyyyMMdd}-{_periodEndExclusive.AddDays(-1):yyyyMMdd}.csv"
        };

        if (dialog.ShowDialog(this) != true)
        {
            return;
        }

        try
        {
            var lines = new List<string> { "Chamado;Data;Inicio;Fim;Duracao_min;Duracao" };

            foreach (var entry in entries.OrderBy(x => x.StartedAt))
            {
                var start = LaterOf(entry.StartedAt, _periodStart);
                var end = EarlierOf(entry.EndedAt ?? DateTime.Now, _periodEndExclusive);
                var duration = GetDurationWithinRange(entry, _periodStart, _periodEndExclusive);
                lines.Add(
                    $"{entry.TicketCode};" +
                    $"{start:dd/MM/yyyy};" +
                    $"{start:HH:mm};" +
                    $"{(entry.EndedAt is null ? "Em andamento" : end.ToString("HH:mm"))};" +
                    $"{(int)duration.TotalMinutes};" +
                    $"{FormatShortDuration(duration)}");
            }

            // UTF-8 BOM so Excel opens correctly with Brazilian locale
            File.WriteAllLines(dialog.FileName, lines, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            SetStatus($"CSV exportado para {dialog.FileName}.");
        }
        catch (IOException exception)
        {
            MessageBox.Show(
                $"Não foi possível salvar o arquivo CSV.\n\n{exception.Message}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void ShowInsightsButton_Click(object sender, RoutedEventArgs e)
    {
        var w = new InsightsWindow(_store) { Owner = this };
        w.Show();
    }

    private void ThemeToggleButton_Click(object sender, RoutedEventArgs e)
    {
        var isDark = _data.Theme == "dark";
        _data.Theme = isDark ? "light" : "dark";
        App.ApplyTheme(_data.Theme);
        ThemeToggleButton.Content = _data.Theme == "dark" ? "☀️" : "🌙";
        TrySaveState(showError: false);
    }

    private void LanguageComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (LanguageComboBox?.SelectedItem is ComboBoxItem item && item.Tag is string lang)
        {
            if (_data.Language != lang)
            {
                _data.Language = lang;
                LocalizationManager.ApplyLanguage(lang);
                TrySaveState(showError: false);
                RefreshPeriodLabels();
            }
        }
    }

    private void SetLanguageComboBoxSelection(string lang)
    {
        if (LanguageComboBox is null) return;
        foreach (ComboBoxItem item in LanguageComboBox.Items)
        {
            if (string.Equals(item.Tag as string, lang, StringComparison.OrdinalIgnoreCase))
            {
                LanguageComboBox.SelectedItem = item;
                break;
            }
        }
    }

    private void FavoriteToggleButton_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            return;
        }

        var ticket = FindTicket(_selectedTicketCode);
        if (ticket is null)
        {
            return;
        }

        ticket.IsFavorite = !ticket.IsFavorite;
        FavoriteToggleButton.Content = ticket.IsFavorite ? "⭐" : "☆";
        TrySaveState(showError: false);
        RefreshTicketList();
    }

    // ── Drag & Drop ──────────────────────────────────────────────────────────
    private void DocumentDropArea_DragEnter(object sender, DragEventArgs e)
    {
        if (e.Data.GetDataPresent(DataFormats.FileDrop) && !string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            DragDropOverlay.Visibility = Visibility.Visible;
            e.Effects = DragDropEffects.Copy;
            e.Handled = true;
        }
    }

    private void DocumentDropArea_DragLeave(object sender, DragEventArgs e)
    {
        DragDropOverlay.Visibility = Visibility.Collapsed;
    }

    private void DocumentDropArea_DragOver(object sender, DragEventArgs e)
    {
        if (e.Data.GetDataPresent(DataFormats.FileDrop) && !string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            e.Effects = DragDropEffects.Copy;
            e.Handled = true;
        }
        else
        {
            e.Effects = DragDropEffects.None;
        }
    }

    private void DocumentDropArea_Drop(object sender, DragEventArgs e)
    {
        DragDropOverlay.Visibility = Visibility.Collapsed;

        if (!e.Data.GetDataPresent(DataFormats.FileDrop) || string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            return;
        }

        var ticket = FindTicket(_selectedTicketCode);
        if (ticket is null)
        {
            SetStatus("Selecione um chamado antes de soltar arquivos.");
            return;
        }

        var files = (string[])e.Data.GetData(DataFormats.FileDrop);
        ticket.Attachments ??= [];
        var attachedCount = 0;
        var errors = new List<string>();

        foreach (var file in files)
        {
            if (!File.Exists(file))
            {
                continue;
            }

            try
            {
                var stored = _store.CopyAttachment(ticket.Code, file);
                ticket.Attachments.Add(new TicketAttachment
                {
                    DocumentType = "other",
                    OriginalFileName = Path.GetFileName(file),
                    StoredRelativePath = stored,
                    SizeBytes = new FileInfo(file).Length,
                    AddedAt = DateTime.Now
                });
                attachedCount++;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
            {
                errors.Add($"{Path.GetFileName(file)}: {ex.Message}");
            }
        }

        if (attachedCount > 0)
        {
            ticket.UpdatedAt = DateTime.Now;
            TrySaveState();
            RefreshTicketList();
            DisplayTicketDetails(ticket.Code);
            SetStatus($"{attachedCount} arquivo(s) anexado(s) por drag & drop em {ticket.Code}.");
        }

        if (errors.Count > 0)
        {
            MessageBox.Show(
                $"Alguns arquivos não puderam ser anexados:\n\n{string.Join("\n", errors)}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    // ── Voice Notes ──────────────────────────────────────────────────────────
    private void VoiceNoteButton_Click(object sender, RoutedEventArgs e)
    {
        if (_voiceRecorder?.IsRecording == true)
        {
            StopVoiceRecording();
        }
        else
        {
            StartVoiceRecording();
        }
    }

    private void StartVoiceRecording()
    {
        var ticketCode = GetActiveEntry()?.TicketCode ?? _selectedTicketCode;
        if (string.IsNullOrWhiteSpace(ticketCode))
        {
            MessageBox.Show(
                "Inicie ou selecione um chamado antes de gravar uma nota de voz.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        try
        {
            var tempPath = Path.Combine(Path.GetTempPath(), $"controlador-voice-{Guid.NewGuid():N}.wav");
            _voiceRecorder?.Dispose();
            _voiceRecorder = new VoiceRecorder();
            _voiceRecorder.StartRecording(tempPath);

            VoiceNoteButton.Content = "⏹ Parar";
            VoiceNoteButton.Tag = tempPath;
            SetStatus($"Gravando nota de voz para {ticketCode}...");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Não foi possível iniciar a gravação.\n\n{ex.Message}\n\nVerifique se há um microfone disponível.",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void StopVoiceRecording()
    {
        var ticketCode = GetActiveEntry()?.TicketCode ?? _selectedTicketCode;
        var tempPath = VoiceNoteButton.Tag as string;

        _voiceRecorder?.StopRecording();

        VoiceNoteButton.Content = "🎙 Gravar";
        VoiceNoteButton.Tag = null;

        if (string.IsNullOrWhiteSpace(ticketCode) || string.IsNullOrWhiteSpace(tempPath))
        {
            return;
        }

        SetStatus("Processando nota de voz...");

        Task.Delay(300).ContinueWith(async _ =>
        {
            try
            {
                if (!File.Exists(tempPath))
                {
                    return;
                }

                // 1. Copy audio attachment
                string stored = _store.CopyAttachment(ticketCode, tempPath);
                long sizeBytes = new FileInfo(tempPath).Length;
                DateTime now = DateTime.Now;
                var fileName = $"nota-voz-{now:yyyyMMdd-HHmmss}.wav";

                // 2. Perform local transcription with Whisper.net
                var modelsDir = Path.Combine(_store.DataDirectory, "models");
                var transcribedText = await SpeechToTextService.TranscribeAsync(tempPath, modelsDir, msg =>
                {
                    Dispatcher.Invoke(() => SetStatus(msg));
                }, LocalizationManager.CurrentLanguage);

                Dispatcher.Invoke(() =>
                {
                    var ticket = GetOrCreateTicket(ticketCode);
                    ticket.Attachments ??= [];
                    ticket.Attachments.Add(new TicketAttachment
                    {
                        DocumentType = "voice-note",
                        OriginalFileName = fileName,
                        StoredRelativePath = stored,
                        SizeBytes = sizeBytes,
                        AddedAt = now
                    });

                    if (!string.IsNullOrWhiteSpace(transcribedText))
                    {
                        ticket.Notes.Add(new TicketNote
                        {
                            CreatedAt = now,
                            Text = $"[🎙 Voz]: {transcribedText}"
                        });
                    }

                    ticket.UpdatedAt = DateTime.Now;
                    TrySaveState();
                    RefreshAll();
                    _selectedTicketCode = ticket.Code;
                    DisplayTicketDetails(ticket.Code);

                    SetStatus(string.IsNullOrWhiteSpace(transcribedText)
                        ? $"Nota de voz salva em {ticket.Code}."
                        : $"Nota de voz gravada e transcrita em {ticket.Code}!");
                });
            }
            catch (Exception ex)
            {
                Dispatcher.Invoke(() => SetStatus($"Erro ao processar nota de voz: {ex.Message}"));
            }
            finally
            {
                try { File.Delete(tempPath); } catch (IOException) { }
            }
        });
    }

    // ── Autocomplete ─────────────────────────────────────────────────────────
    private void TicketInput_TextChanged(object sender, TextChangedEventArgs e)
    {
        var text = TicketInputTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(text) || text.Length < 2)
        {
            TicketSuggestionsPopup.IsOpen = false;
            return;
        }

        var suggestions = _data.Tickets
            .Where(t => t.Code.Contains(text, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(t => t.IsFavorite)
            .ThenByDescending(t => t.UpdatedAt)
            .Take(8)
            .Select(t => new TicketSuggestionItem
            {
                Code = t.Code,
                StarIcon = t.IsFavorite ? "⭐" : "",
                Subtitle = $"{FormatShortDuration(GetDurationForTicket(t.Code))} · {FormatActivity(t.UpdatedAt)}"
            })
            .ToList();

        if (suggestions.Count == 0)
        {
            TicketSuggestionsPopup.IsOpen = false;
            return;
        }

        TicketSuggestionsList.ItemsSource = suggestions;
        TicketSuggestionsPopup.Width = TicketInputTextBox.ActualWidth;
        TicketSuggestionsPopup.IsOpen = true;
    }

    private void TicketInput_LostFocus(object sender, RoutedEventArgs e)
    {
        // Delay so click on popup item registers first
        Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Background, () =>
        {
            if (!TicketSuggestionsPopup.IsKeyboardFocusWithin)
            {
                TicketSuggestionsPopup.IsOpen = false;
            }
        });
    }

    private void TicketSuggestionsList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (TicketSuggestionsList.SelectedItem is TicketSuggestionItem item)
        {
            TicketInputTextBox.Text = item.Code;
            TicketInputTextBox.SelectionStart = item.Code.Length;
            TicketSuggestionsPopup.IsOpen = false;
            TicketInputTextBox.Focus();
        }
    }

    private void TicketSuggestionsList_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Escape)
        {
            TicketSuggestionsPopup.IsOpen = false;
            TicketInputTextBox.Focus();
            e.Handled = true;
        }
        else if (e.Key == System.Windows.Input.Key.Enter && TicketSuggestionsList.SelectedItem is TicketSuggestionItem item)
        {
            TicketInputTextBox.Text = item.Code;
            TicketSuggestionsPopup.IsOpen = false;
            StartFromInput();
            e.Handled = true;
        }
    }

    // ── Idle return handler ──────────────────────────────────────────────────
    private void HandleIdleReturn(TimeEntry activeEntry, DateTime idleStartedAt, TimeSpan totalIdle)
    {
        var dialog = new IdleReturnWindow(activeEntry.TicketCode, idleStartedAt, totalIdle) { Owner = this };
        if (dialog.ShowDialog() != true || dialog.Result is null)
        {
            return;
        }

        switch (dialog.Result.Action)
        {
            case IdleReturnAction.Discard:
                // End the active session at idle start, then start a new session now
                EndEntry(activeEntry, idleStartedAt);
                _data.TimeEntries.Add(new TimeEntry
                {
                    TicketCode = activeEntry.TicketCode,
                    StartedAt = DateTime.Now
                });
                TrySaveState();
                RefreshAll();
                SetStatus($"Período ocioso descontado. Retomando {activeEntry.TicketCode}.");
                break;

            case IdleReturnAction.Move:
                var moveToCode = dialog.Result.MoveToTicketCode;
                if (!string.IsNullOrWhiteSpace(moveToCode))
                {
                    // End current session at idle start
                    EndEntry(activeEntry, idleStartedAt);
                    // Create idle-period session on the other ticket
                    var idleTicket = GetOrCreateTicket(moveToCode);
                    _data.TimeEntries.Add(new TimeEntry
                    {
                        TicketCode = idleTicket.Code,
                        StartedAt = idleStartedAt,
                        EndedAt = DateTime.Now
                    });
                    // Resume original ticket
                    _data.TimeEntries.Add(new TimeEntry
                    {
                        TicketCode = activeEntry.TicketCode,
                        StartedAt = DateTime.Now
                    });
                    TrySaveState();
                    RefreshAll();
                    SetStatus($"Período ocioso movido para {moveToCode}. Retomando {activeEntry.TicketCode}.");
                }
                break;

            // IdleReturnAction.Keep: do nothing, time stays as recorded
        }
    }

    private void CreateBackupButton_Click(object sender, RoutedEventArgs e)
    {
        PersistDocumentationFromControls();
        if (!TrySaveState())
        {
            return;
        }

        try
        {
            var backupFile = _store.CreateBackup();
            SetStatus($"Backup criado em {backupFile}.");
        }
        catch (IOException exception)
        {
            MessageBox.Show(
                $"Não foi possível criar o backup.\n\n{exception.Message}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void OpenDataFolderButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(_store.DataDirectory);
            Process.Start(new ProcessStartInfo
            {
                FileName = _store.DataDirectory,
                UseShellExecute = true
            });
        }
        catch (Exception exception) when (exception is IOException or System.ComponentModel.Win32Exception)
        {
            MessageBox.Show(
                $"Não foi possível abrir a pasta de dados.\n\n{exception.Message}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void ExportBackupButton_Click(object sender, RoutedEventArgs e)
    {
        PersistDocumentationFromControls();
        if (!TrySaveState())
        {
            return;
        }

        var dialog = new SaveFileDialog
        {
            Title = "Exportar backup do Controlador",
            Filter = "Backup do Controlador (*.zip)|*.zip",
            DefaultExt = ".zip",
            AddExtension = true,
            OverwritePrompt = true,
            FileName = $"controlador-{DateTime.Now:yyyyMMdd-HHmmss}.zip"
        };

        if (dialog.ShowDialog(this) != true)
        {
            return;
        }

        try
        {
            _store.ExportBackup(dialog.FileName);
            SetStatus($"Backup exportado para {dialog.FileName}.");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidOperationException or SqliteException)
        {
            MessageBox.Show(
                $"Não foi possível exportar o backup.\n\n{exception.Message}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void ImportBackupButton_Click(object sender, RoutedEventArgs e)
    {
        PersistDocumentationFromControls();
        if (!TrySaveState())
        {
            return;
        }

        var dialog = new OpenFileDialog
        {
            Title = "Importar backup do Controlador",
            Filter = "Backup do Controlador (*.zip)|*.zip",
            Multiselect = false,
            CheckFileExists = true
        };

        if (dialog.ShowDialog(this) != true)
        {
            return;
        }

        var confirmation = MessageBox.Show(
            "A importação substituirá os dados locais deste computador, incluindo os anexos.\n\n" +
            "Antes da troca, o Controlador criará um backup automático dos dados atuais.\n\n" +
            "Deseja continuar?",
            "Importar backup",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);

        if (confirmation != MessageBoxResult.Yes)
        {
            return;
        }

        try
        {
            var automaticBackup = _store.CreateBackup();
            _store.ImportBackup(dialog.FileName);

            _data = _store.Load();
            _selectedTicketCode = null;
            InitializePeriodFilter();
            var recoveryNotice = RecoverUnfinishedEntries();
            RefreshAll();
            SetStatus(recoveryNotice ?? $"Backup importado. Uma cópia dos dados anteriores foi salva em {automaticBackup}.");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidDataException or InvalidOperationException or SqliteException)
        {
            MessageBox.Show(
                $"Não foi possível importar o backup. Os dados locais não foram alterados quando a importação não pôde ser concluída.\n\n{exception.Message}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void AttachDocumentButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { Tag: string documentType } ||
            string.IsNullOrWhiteSpace(_selectedTicketCode) ||
            !DocumentDefinitions.Any(definition => definition.Type == documentType))
        {
            SetStatus("Selecione um chamado antes de anexar um arquivo.");
            return;
        }

        var ticket = FindTicket(_selectedTicketCode);
        if (ticket is null)
        {
            SetStatus("O chamado selecionado não foi encontrado.");
            return;
        }

        var dialog = new OpenFileDialog
        {
            Title = $"Anexar arquivos em {ticket.Code}",
            Multiselect = true,
            Filter = "Todos os arquivos|*.*"
        };

        if (dialog.ShowDialog(this) != true)
        {
            return;
        }

        ticket.Attachments ??= [];
        var attachedCount = 0;
        var errors = new List<string>();

        foreach (var sourceFile in dialog.FileNames)
        {
            try
            {
                var storedRelativePath = _store.CopyAttachment(ticket.Code, sourceFile);
                ticket.Attachments.Add(new TicketAttachment
                {
                    DocumentType = documentType,
                    OriginalFileName = Path.GetFileName(sourceFile),
                    StoredRelativePath = storedRelativePath,
                    SizeBytes = new FileInfo(sourceFile).Length,
                    AddedAt = DateTime.Now
                });
                attachedCount++;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException)
            {
                errors.Add($"{Path.GetFileName(sourceFile)}: {exception.Message}");
            }
        }

        if (attachedCount > 0)
        {
            ticket.UpdatedAt = DateTime.Now;
            TrySaveState();
            RefreshTicketList();
            DisplayTicketDetails(ticket.Code);
            SetStatus($"{attachedCount} arquivo(s) anexado(s) em {ticket.Code}.");
        }

        if (errors.Count > 0)
        {
            MessageBox.Show(
                $"Alguns arquivos não puderam ser anexados:\n\n{string.Join("\n", errors)}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void OpenAttachmentButton_Click(object sender, RoutedEventArgs e)
    {
        if (!TryGetAttachmentFromSender(sender, out _, out var attachment))
        {
            SetStatus("O anexo selecionado não foi encontrado.");
            return;
        }

        try
        {
            var attachmentPath = _store.GetAttachmentFullPath(attachment.StoredRelativePath);
            if (!File.Exists(attachmentPath))
            {
                MessageBox.Show(
                    "O arquivo não está mais disponível no repositório local.",
                    "Controlador",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = attachmentPath,
                UseShellExecute = true
            });
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            MessageBox.Show(
                $"Não foi possível abrir o anexo.\n\n{exception.Message}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void RemoveAttachmentButton_Click(object sender, RoutedEventArgs e)
    {
        if (!TryGetAttachmentFromSender(sender, out var ticket, out var attachment))
        {
            SetStatus("O anexo selecionado não foi encontrado.");
            return;
        }

        var confirmation = MessageBox.Show(
            $"Remover '{attachment.OriginalFileName}' do repositório local?\n\nO arquivo original fora do Controlador não será alterado.",
            "Remover anexo",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);

        if (confirmation != MessageBoxResult.Yes)
        {
            return;
        }

        try
        {
            _store.DeleteAttachment(attachment.StoredRelativePath);
            ticket.Attachments.Remove(attachment);
            ticket.UpdatedAt = DateTime.Now;
            TrySaveState();
            RefreshTicketList();
            DisplayTicketDetails(ticket.Code);
            SetStatus($"Anexo removido de {ticket.Code}.");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            MessageBox.Show(
                $"Não foi possível remover o anexo.\n\n{exception.Message}",
                "Controlador",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void PeriodPresetComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_periodControlsReady || _isAdjustingPeriodControls)
        {
            return;
        }

        var preset = GetSelectedPeriodPreset();
        if (preset == PeriodPreset.Custom)
        {
            SetStatus("Selecione as datas desejadas e clique em Aplicar.");
            return;
        }

        ApplyPeriodPreset(preset, showValidation: false);
    }

    private void PeriodDatePicker_SelectedDateChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_periodControlsReady || _isAdjustingPeriodControls)
        {
            return;
        }

        _isAdjustingPeriodControls = true;
        try
        {
            PeriodPresetComboBox.SelectedIndex = (int)PeriodPreset.Custom;
        }
        finally
        {
            _isAdjustingPeriodControls = false;
        }

        SetStatus("Período personalizado pronto para aplicar.");
    }

    private void ApplyPeriodFilterButton_Click(object sender, RoutedEventArgs e)
    {
        ApplyPeriodPreset(GetSelectedPeriodPreset(), showValidation: true);
    }

    private void InitializePeriodFilter()
    {
        _periodControlsReady = false;
        SetPeriodRange(DateTime.Today, DateTime.Today, PeriodPreset.Today, refresh: false);
        _periodControlsReady = true;
    }

    private void ApplyPeriodPreset(PeriodPreset preset, bool showValidation)
    {
        var today = DateTime.Today;

        switch (preset)
        {
            case PeriodPreset.Today:
                SetPeriodRange(today, today, preset);
                return;

            case PeriodPreset.Week:
                var weekStart = StartOfWeek(today);
                SetPeriodRange(weekStart, weekStart.AddDays(6), preset);
                return;

            case PeriodPreset.Month:
                var monthStart = new DateTime(today.Year, today.Month, 1);
                SetPeriodRange(monthStart, monthStart.AddMonths(1).AddDays(-1), preset);
                return;

            case PeriodPreset.Custom:
                var start = PeriodStartDatePicker.SelectedDate?.Date;
                var end = PeriodEndDatePicker.SelectedDate?.Date;
                if (start is null || end is null)
                {
                    if (showValidation)
                    {
                        MessageBox.Show(
                            "Informe a data inicial e a data final do período.",
                            "Período personalizado",
                            MessageBoxButton.OK,
                            MessageBoxImage.Information);
                    }

                    return;
                }

                if (end < start)
                {
                    if (showValidation)
                    {
                        MessageBox.Show(
                            "A data final deve ser igual ou posterior à data inicial.",
                            "Período personalizado",
                            MessageBoxButton.OK,
                            MessageBoxImage.Information);
                    }

                    return;
                }

                SetPeriodRange(start.Value, end.Value, preset);
                return;
        }
    }

    private void SetPeriodRange(DateTime startInclusive, DateTime endInclusive, PeriodPreset preset, bool refresh = true)
    {
        _periodStart = startInclusive.Date;
        _periodEndExclusive = endInclusive.Date.AddDays(1);
        _activePeriodPreset = preset;

        _isAdjustingPeriodControls = true;
        try
        {
            PeriodStartDatePicker.SelectedDate = _periodStart;
            PeriodEndDatePicker.SelectedDate = endInclusive.Date;
            PeriodPresetComboBox.SelectedIndex = (int)preset;
        }
        finally
        {
            _isAdjustingPeriodControls = false;
        }

        RefreshPeriodLabels();
        if (!refresh)
        {
            return;
        }

        RefreshPeriodSummary();
        RefreshPeriodEntries();
        if (!string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            DisplayTicketDetails(_selectedTicketCode);
        }
    }

    private void RefreshPeriodLabels()
    {
        var endInclusive = _periodEndExclusive.AddDays(-1);
        var rangeText = _periodStart == endInclusive
            ? _periodStart.ToString("dd/MM/yyyy")
            : $"{_periodStart:dd/MM/yyyy} a {endInclusive:dd/MM/yyyy}";

        PeriodDescriptionText.Text = _activePeriodPreset switch
        {
            PeriodPreset.Today => $"Hoje — {rangeText}",
            PeriodPreset.Week => $"Esta semana — {rangeText}",
            PeriodPreset.Month => $"Este mês — {rangeText}",
            _ => $"Personalizado — {rangeText}"
        };
        PeriodTitleText.Text = _activePeriodPreset switch
        {
            PeriodPreset.Today => "HOJE",
            PeriodPreset.Week => "SEMANA",
            PeriodPreset.Month => "MÊS",
            _ => "PERSONALIZADO"
        };
        PeriodHoursCaptionText.Text = "tempo registrado";
        PeriodTicketsCaptionText.Text = "chamados no período";
        PeriodSessionsCaptionText.Text = "sessões no período";
        PeriodSummaryTitleText.Text = $"SESSÕES DO PERÍODO — {rangeText.ToUpperInvariant()}";
    }

    private PeriodPreset GetSelectedPeriodPreset()
    {
        return (PeriodPresetComboBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() switch
        {
            "week" => PeriodPreset.Week,
            "month" => PeriodPreset.Month,
            "custom" => PeriodPreset.Custom,
            _ => PeriodPreset.Today
        };
    }

    private static DateTime StartOfWeek(DateTime day)
    {
        var daysSinceMonday = ((int)day.DayOfWeek + 6) % 7;
        return day.Date.AddDays(-daysSinceMonday);
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _clock.Stop();
        if (Application.Current is App application)
        {
            application.ShowTimerOverlayRequested -= App_ShowTimerOverlayRequested;
            application.ShowMainWindowRequested -= App_ShowMainWindowRequested;
            application.TogglePauseResumeRequested -= App_TogglePauseResumeRequested;
        }

        if (_hwndSource is not null)
        {
            var helper = new WindowInteropHelper(this);
            UnregisterHotKey(helper.Handle, HOTKEY_ID_OVERLAY);
            UnregisterHotKey(helper.Handle, HOTKEY_ID_PAUSE);
            _hwndSource.RemoveHook(HwndProc);
        }

        _timerOverlay?.CloseForApplicationExit();
        PersistDocumentationFromControls();
        _voiceRecorder?.Dispose();
        TrySaveState(showError: false);
    }

    private void StartFromInput()
    {
        var ticketCode = NormalizeTicketCode(TicketInputTextBox.Text);
        if (ticketCode is null)
        {
            SetStatus("Informe o número do chamado para iniciar o contador.");
            TicketInputTextBox.Focus();
            return;
        }

        PersistDocumentationFromControls();
        StartTicket(ticketCode, isResume: false);
    }

    internal bool TryStartTicketFromOverlay(string input, out string validationMessage)
    {
        var ticketCode = NormalizeTicketCode(input);
        if (ticketCode is null)
        {
            validationMessage = "Informe o número do chamado para iniciar o contador.";
            return false;
        }

        PersistDocumentationFromControls();
        StartTicket(ticketCode, isResume: false);
        validationMessage = string.Empty;
        return true;
    }

    private void StartTicket(string ticketCode, bool isResume)
    {
        var activeEntry = GetActiveEntry();
        if (activeEntry is not null && string.Equals(activeEntry.TicketCode, ticketCode, StringComparison.OrdinalIgnoreCase))
        {
            TicketInputTextBox.Clear();
            SetStatus($"{ticketCode} já está em andamento.");
            return;
        }

        if (activeEntry is not null)
        {
            EndEntry(activeEntry, DateTime.Now);
        }

        var ticket = GetOrCreateTicket(ticketCode);
        ticket.UpdatedAt = DateTime.Now;
        _data.TimeEntries.Add(new TimeEntry
        {
            TicketCode = ticket.Code,
            StartedAt = DateTime.Now
        });
        _data.LastTicketCode = ticket.Code;
        _selectedTicketCode = ticket.Code;
        TicketInputTextBox.Clear();

        TrySaveState();
        RefreshAll();
        SetStatus(isResume ? $"{ticket.Code} retomado." : $"Registrando trabalho em {ticket.Code}.");
    }

    private void EndEntry(TimeEntry entry, DateTime endedAt)
    {
        entry.EndedAt = endedAt;
        _data.LastTicketCode = entry.TicketCode;

        var ticket = FindTicket(entry.TicketCode);
        if (ticket is not null)
        {
            ticket.UpdatedAt = endedAt;
        }
    }

    private TimeEntry? GetActiveEntry()
    {
        return _data.TimeEntries
            .Where(entry => entry.EndedAt is null)
            .OrderByDescending(entry => entry.StartedAt)
            .FirstOrDefault();
    }

    internal TimerOverlayState GetTimerOverlayState()
    {
        var activeEntry = GetActiveEntry();
        return new TimerOverlayState(
            activeEntry?.TicketCode,
            _data.LastTicketCode,
            activeEntry?.StartedAt);
    }

    private Ticket? FindTicket(string ticketCode)
    {
        return _data.Tickets.FirstOrDefault(ticket => string.Equals(ticket.Code, ticketCode, StringComparison.OrdinalIgnoreCase));
    }

    private Ticket GetOrCreateTicket(string ticketCode)
    {
        var ticket = FindTicket(ticketCode);
        if (ticket is not null)
        {
            return ticket;
        }

        ticket = new Ticket
        {
            Code = ticketCode,
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now
        };
        _data.Tickets.Add(ticket);
        return ticket;
    }

    private bool PersistDocumentationFromControls()
    {
        if (_isLoadingTicketDetails || string.IsNullOrWhiteSpace(_selectedTicketCode))
        {
            return false;
        }

        var ticket = FindTicket(_selectedTicketCode);
        if (ticket is null)
        {
            return false;
        }

        var changed = ticket.Context != ContextTextBox.Text ||
                      ticket.Analysis != AnalysisTextBox.Text ||
                      ticket.Actions != ActionsTextBox.Text ||
                      ticket.Solution != SolutionTextBox.Text ||
                      ticket.Tests != TestsTextBox.Text ||
                      ticket.Pending != PendingTextBox.Text;

        if (!changed)
        {
            return false;
        }

        ticket.Context = ContextTextBox.Text;
        ticket.Analysis = AnalysisTextBox.Text;
        ticket.Actions = ActionsTextBox.Text;
        ticket.Solution = SolutionTextBox.Text;
        ticket.Tests = TestsTextBox.Text;
        ticket.Pending = PendingTextBox.Text;
        ticket.UpdatedAt = DateTime.Now;
        return true;
    }

    private void RefreshAll()
    {
        _selectedTicketCode ??= GetActiveEntry()?.TicketCode ?? _data.LastTicketCode;
        RefreshActivePanel();
        RefreshPeriodSummary();
        RefreshPeriodEntries();
        RefreshTicketList();
    }

    private void RefreshActivePanel()
    {
        var activeEntry = GetActiveEntry();
        if (activeEntry is not null)
        {
            CurrentTicketText.Text = activeEntry.TicketCode;
            TimerText.Text = FormatDuration(DateTime.Now - activeEntry.StartedAt);
            TimerStatusText.Text = $"Em andamento desde {activeEntry.StartedAt:HH:mm}";
            StartSwitchButton.Content = "Iniciar / trocar";
            PauseResumeButton.Content = "Pausar";
            PauseResumeButton.IsEnabled = true;
            return;
        }

        TimerText.Text = "00:00:00";
        StartSwitchButton.Content = "Iniciar chamado";

        if (string.IsNullOrWhiteSpace(_data.LastTicketCode))
        {
            CurrentTicketText.Text = "Nenhum chamado ativo";
            TimerStatusText.Text = "Digite um chamado para começar.";
            PauseResumeButton.Content = "Pausar";
            PauseResumeButton.IsEnabled = false;
            return;
        }

        CurrentTicketText.Text = $"Pausado: {_data.LastTicketCode}";
        TimerStatusText.Text = "O próximo registro pode retomar este chamado ou iniciar outro.";
        PauseResumeButton.Content = "Retomar";
        PauseResumeButton.IsEnabled = true;
    }

    private void RefreshPeriodSummary()
    {
        var entries = GetEntriesOverlappingPeriod();
        var total = entries.Aggregate(
            TimeSpan.Zero,
            (current, entry) => current + GetDurationWithinRange(entry, _periodStart, _periodEndExclusive));

        TodayTotalText.Text = FormatDuration(total);
        TodayTicketCountText.Text = entries
            .Select(entry => entry.TicketCode)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count()
            .ToString();
        TodaySessionCountText.Text = entries.Count.ToString();
    }

    private void RefreshPeriodEntries()
    {
        TodayEntriesGrid.ItemsSource = GetEntriesOverlappingPeriod()
            .OrderBy(entry => entry.StartedAt)
            .Select(entry =>
            {
                var start = LaterOf(entry.StartedAt, _periodStart);
                var end = EarlierOf(entry.EndedAt ?? DateTime.Now, _periodEndExclusive);
                return new SessionRow
                {
                    EntryId = entry.Id,
                    TicketCode = entry.TicketCode,
                    Date = start.ToString("dd/MM/yyyy"),
                    StartedAt = start.ToString("HH:mm"),
                    EndedAt = entry.EndedAt is null ? "Em andamento" : end.ToString("HH:mm"),
                    Duration = FormatShortDuration(GetDurationWithinRange(entry, _periodStart, _periodEndExclusive))
                };
            })
            .ToList();
    }

    private void RefreshTicketList()
    {
        var filter = TicketSearchTextBox.Text.Trim();
        var tickets = _data.Tickets
            .Where(ticket => MatchesFilter(ticket, filter))
            .OrderByDescending(ticket => ticket.IsFavorite)
            .ThenByDescending(ticket => ticket.UpdatedAt)
            .ThenBy(ticket => ticket.Code)
            .Select(ticket => new TicketListItem
            {
                Code = ticket.Code,
                StarIcon = ticket.IsFavorite ? "⭐" : "",
                Subtitle = $"{FormatShortDuration(GetDurationForTicket(ticket.Code))} registrados · {FormatActivity(ticket.UpdatedAt)}"
            })
            .ToList();

        var selectedItem = tickets.FirstOrDefault(ticket => string.Equals(ticket.Code, _selectedTicketCode, StringComparison.OrdinalIgnoreCase));

        _isRefreshingTicketList = true;
        TicketList.ItemsSource = tickets;
        TicketList.SelectedItem = selectedItem;
        _isRefreshingTicketList = false;

        if (selectedItem is not null)
        {
            _selectedTicketCode = selectedItem.Code;
            DisplayTicketDetails(selectedItem.Code);
        }
        else
        {
            ClearTicketDetails();
        }
    }

    private void DisplayTicketDetails(string ticketCode)
    {
        var ticket = FindTicket(ticketCode);
        if (ticket is null)
        {
            ClearTicketDetails();
            return;
        }

        _isLoadingTicketDetails = true;
        NoTicketSelectedText.Visibility = Visibility.Collapsed;
        TicketDetailsScrollViewer.Visibility = Visibility.Visible;
        SelectedTicketCodeText.Text = ticket.Code;
        FavoriteToggleButton.Content = ticket.IsFavorite ? "⭐" : "☆";
        SelectedTicketStatsText.Text = $"{FormatShortDuration(GetDurationForTicket(ticket.Code))} registrados · {FormatShortDuration(GetDurationForTicketInCurrentPeriod(ticket.Code))} no período · {ticket.Notes.Count} notas · {ticket.Attachments.Count} anexos";
        DocumentRequirementsList.ItemsSource = BuildDocumentRequirementRows(ticket);
        ContextTextBox.Text = ticket.Context;
        AnalysisTextBox.Text = ticket.Analysis;
        ActionsTextBox.Text = ticket.Actions;
        SolutionTextBox.Text = ticket.Solution;
        TestsTextBox.Text = ticket.Tests;
        PendingTextBox.Text = ticket.Pending;
        NotesList.ItemsSource = ticket.Notes
            .OrderByDescending(note => note.CreatedAt)
            .Select(note => new NoteRow
            {
                When = note.CreatedAt.ToString("dd/MM/yyyy HH:mm"),
                Text = note.Text
            })
            .ToList();
        _isLoadingTicketDetails = false;
    }

    private void ClearTicketDetails()
    {
        _isLoadingTicketDetails = true;
        NoTicketSelectedText.Visibility = Visibility.Visible;
        TicketDetailsScrollViewer.Visibility = Visibility.Collapsed;
        SelectedTicketCodeText.Text = string.Empty;
        SelectedTicketStatsText.Text = string.Empty;
        ContextTextBox.Clear();
        AnalysisTextBox.Clear();
        ActionsTextBox.Clear();
        SolutionTextBox.Clear();
        TestsTextBox.Clear();
        PendingTextBox.Clear();
        DocumentRequirementsList.ItemsSource = null;
        NotesList.ItemsSource = null;
        _isLoadingTicketDetails = false;
    }

    private List<TimeEntry> GetEntriesOverlappingPeriod()
    {
        return _store.QueryTimeEntriesOverlapping(_periodStart, _periodEndExclusive)
            .Where(entry => GetDurationWithinRange(entry, _periodStart, _periodEndExclusive) > TimeSpan.Zero)
            .ToList();
    }

    private TimeSpan GetDurationForTicket(string ticketCode)
    {
        var now = DateTime.Now;
        return _data.TimeEntries
            .Where(entry => string.Equals(entry.TicketCode, ticketCode, StringComparison.OrdinalIgnoreCase))
            .Aggregate(TimeSpan.Zero, (total, entry) => total + ((entry.EndedAt ?? now) - entry.StartedAt));
    }

    private TimeSpan GetDurationForTicketInCurrentPeriod(string ticketCode)
    {
        return GetEntriesOverlappingPeriod()
            .Where(entry => string.Equals(entry.TicketCode, ticketCode, StringComparison.OrdinalIgnoreCase))
            .Aggregate(
                TimeSpan.Zero,
                (total, entry) => total + GetDurationWithinRange(entry, _periodStart, _periodEndExclusive));
    }

    private List<DocumentRequirementRow> BuildDocumentRequirementRows(Ticket ticket)
    {
        ticket.Attachments ??= [];

        return DocumentDefinitions
            .Select(definition =>
            {
                var attachments = ticket.Attachments
                    .Where(attachment => string.Equals(attachment.DocumentType, definition.Type, StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(attachment => attachment.AddedAt)
                    .Select(attachment => new AttachmentRow
                    {
                        AttachmentId = attachment.Id,
                        FileName = attachment.OriginalFileName,
                        Metadata = $"{attachment.AddedAt:dd/MM/yyyy HH:mm} · {FormatFileSize(attachment.SizeBytes)}{(AttachmentExists(attachment) ? string.Empty : " · arquivo não encontrado")}"
                    })
                    .ToList();

                var statusText = attachments.Count switch
                {
                    0 => "Não anexado",
                    1 => "1 arquivo anexado",
                    _ => $"{attachments.Count} arquivos anexados"
                };

                return new DocumentRequirementRow
                {
                    DocumentType = definition.Type,
                    Name = definition.Name,
                    Description = definition.Description,
                    StatusText = statusText,
                    Attachments = attachments
                };
            })
            .ToList();
    }

    private bool TryGetAttachmentFromSender(object sender, out Ticket ticket, out TicketAttachment attachment)
    {
        ticket = null!;
        attachment = null!;

        if (sender is not FrameworkElement { Tag: not null } element ||
            !Guid.TryParse(element.Tag.ToString(), out var attachmentId))
        {
            return false;
        }

        foreach (var candidateTicket in _data.Tickets)
        {
            var candidateAttachment = candidateTicket.Attachments?.FirstOrDefault(item => item.Id == attachmentId);
            if (candidateAttachment is null)
            {
                continue;
            }

            ticket = candidateTicket;
            attachment = candidateAttachment;
            return true;
        }

        return false;
    }

    private bool AttachmentExists(TicketAttachment attachment)
    {
        try
        {
            return File.Exists(_store.GetAttachmentFullPath(attachment.StoredRelativePath));
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private static TimeSpan GetDurationWithinRange(TimeEntry entry, DateTime startInclusive, DateTime endExclusive)
    {
        var start = LaterOf(entry.StartedAt, startInclusive);
        var end = EarlierOf(entry.EndedAt ?? DateTime.Now, endExclusive);
        return end > start ? end - start : TimeSpan.Zero;
    }

    private static DateTime LaterOf(DateTime first, DateTime second)
    {
        return first > second ? first : second;
    }

    private static DateTime EarlierOf(DateTime first, DateTime second)
    {
        return first < second ? first : second;
    }

    private static string? NormalizeTicketCode(string input)
    {
        var code = input.Trim().ToUpperInvariant();
        return string.IsNullOrWhiteSpace(code) ? null : code;
    }

    private static string FormatDuration(TimeSpan duration)
    {
        var safeDuration = duration < TimeSpan.Zero ? TimeSpan.Zero : duration;
        return $"{(int)safeDuration.TotalHours:00}:{safeDuration.Minutes:00}:{safeDuration.Seconds:00}";
    }

    private static string FormatShortDuration(TimeSpan duration)
    {
        var safeDuration = duration < TimeSpan.Zero ? TimeSpan.Zero : duration;
        return $"{(int)safeDuration.TotalHours}h {safeDuration.Minutes:00}m";
    }

    private static string FormatFileSize(long sizeBytes)
    {
        if (sizeBytes < 1024)
        {
            return $"{sizeBytes} B";
        }

        if (sizeBytes < 1024 * 1024)
        {
            return $"{sizeBytes / 1024d:0.#} KB";
        }

        return $"{sizeBytes / 1024d / 1024d:0.#} MB";
    }

    private static string FormatActivity(DateTime updatedAt)
    {
        if (updatedAt.Date == DateTime.Today)
        {
            return $"hoje às {updatedAt:HH:mm}";
        }

        return updatedAt == default ? "sem atividade" : updatedAt.ToString("dd/MM/yyyy");
    }

    private string? RecoverUnfinishedEntries()
    {
        var unfinishedEntries = _data.TimeEntries.Where(entry => entry.EndedAt is null).ToList();
        if (unfinishedEntries.Count == 0)
        {
            return null;
        }

        foreach (var entry in unfinishedEntries)
        {
            var lastKnownMoment = _data.LastCheckpointAt > entry.StartedAt
                ? _data.LastCheckpointAt
                : entry.StartedAt;
            entry.EndedAt = lastKnownMoment;
            _data.LastTicketCode = entry.TicketCode;
        }

        TrySaveState(showError: false);
        return unfinishedEntries.Count == 1
            ? $"A sessão de {unfinishedEntries[0].TicketCode} foi encerrada no último checkpoint salvo. Você pode corrigi-la no resumo do dia."
            : $"{unfinishedEntries.Count} sessões interrompidas foram encerradas no último checkpoint salvo. Você pode corrigi-las no resumo do dia.";
    }

    private bool TrySaveState(bool showError = true)
    {
        _data.LastCheckpointAt = DateTime.Now;

        try
        {
            _store.Save(_data);
            return true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or SqliteException)
        {
            if (showError)
            {
                MessageBox.Show(
                    $"Não foi possível salvar os dados locais.\n\n{exception.Message}",
                    "Controlador",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }

            return false;
        }
    }

    private void SetStatus(string message)
    {
        FooterStatusText.Text = message;
    }

    private enum PeriodPreset
    {
        Today,
        Week,
        Month,
        Custom
    }

    private sealed record DocumentDefinition(string Type, string Name, string Description);
}

internal sealed class TicketSuggestionItem
{
    public string Code { get; init; } = string.Empty;
    public string StarIcon { get; init; } = string.Empty;
    public string Subtitle { get; init; } = string.Empty;
}
