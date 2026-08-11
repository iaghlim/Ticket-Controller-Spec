namespace Controlador;

public sealed class AppData
{
    public List<Ticket> Tickets { get; set; } = [];

    public List<TimeEntry> TimeEntries { get; set; } = [];

    public string? LastTicketCode { get; set; }

    public DateTime LastCheckpointAt { get; set; }

    public string Theme { get; set; } = "light";

    public string Language { get; set; } = "pt";
}

public sealed class Ticket
{
    public string Code { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string Context { get; set; } = string.Empty;

    public string Analysis { get; set; } = string.Empty;

    public string Actions { get; set; } = string.Empty;

    public string Solution { get; set; } = string.Empty;

    public string Tests { get; set; } = string.Empty;

    public string Pending { get; set; } = string.Empty;

    public bool IsFavorite { get; set; }

    public List<TicketNote> Notes { get; set; } = [];

    public List<TicketAttachment> Attachments { get; set; } = [];
}

public sealed class TicketNote
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public DateTime CreatedAt { get; set; }

    public string Text { get; set; } = string.Empty;
}

public sealed class TicketAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string DocumentType { get; set; } = "other";

    public string OriginalFileName { get; set; } = string.Empty;

    public string StoredRelativePath { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public DateTime AddedAt { get; set; }
}

public sealed class TimeEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string TicketCode { get; set; } = string.Empty;

    public DateTime StartedAt { get; set; }

    public DateTime? EndedAt { get; set; }
}

public sealed record TimerOverlayState(
    string? ActiveTicketCode,
    string? LastTicketCode,
    DateTime? StartedAt);

public sealed class TicketListItem
{
    public string Code { get; init; } = string.Empty;

    public string StarIcon { get; init; } = string.Empty;

    public string Subtitle { get; init; } = string.Empty;
}

public sealed class SessionRow
{
    public Guid EntryId { get; init; }

    public string TicketCode { get; init; } = string.Empty;

    public string Date { get; init; } = string.Empty;

    public string StartedAt { get; init; } = string.Empty;

    public string EndedAt { get; init; } = string.Empty;

    public string Duration { get; init; } = string.Empty;
}

public sealed class NoteRow
{
    public string When { get; init; } = string.Empty;

    public string Text { get; init; } = string.Empty;
}

public sealed class DocumentRequirementRow
{
    public string DocumentType { get; init; } = string.Empty;

    public string Name { get; init; } = string.Empty;

    public string Description { get; init; } = string.Empty;

    public string StatusText { get; init; } = string.Empty;

    public List<AttachmentRow> Attachments { get; init; } = [];
}

public sealed class AttachmentRow
{
    public Guid AttachmentId { get; init; }

    public string FileName { get; init; } = string.Empty;

    public string Metadata { get; init; } = string.Empty;
}
