using System.Globalization;
using System.IO;
using System.IO.Compression;
using Microsoft.Data.Sqlite;

namespace Controlador;

public sealed class LocalStore
{
    private const long MaximumImportSizeBytes = 2L * 1024 * 1024 * 1024;

    public LocalStore(string? dataDirectory = null)
    {
        DataDirectory = dataDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Controlador");
        DatabaseFile = Path.Combine(DataDirectory, "controlador.db");
        AttachmentsDirectory = Path.Combine(DataDirectory, "attachments");
    }

    public string DataDirectory { get; }

    public string DatabaseFile { get; }

    public string AttachmentsDirectory { get; }

    public AppData Load()
    {
        EnsureDatabase();

        var data = new AppData();
        var ticketsByCode = new Dictionary<string, Ticket>(StringComparer.OrdinalIgnoreCase);

        using var connection = OpenConnection();

        using (var command = CreateCommand(connection, null, """
            SELECT code, created_at_utc, updated_at_utc, problem_context, analysis, actions, solution, tests, pending, is_favorite
            FROM tickets
            ORDER BY updated_at_utc DESC, code;
            """))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                var ticket = new Ticket
                {
                    Code = reader.GetString(0),
                    CreatedAt = FromStorageDateTime(reader.GetString(1)),
                    UpdatedAt = FromStorageDateTime(reader.GetString(2)),
                    Context = reader.GetString(3),
                    Analysis = reader.GetString(4),
                    Actions = reader.GetString(5),
                    Solution = reader.GetString(6),
                    Tests = reader.GetString(7),
                    Pending = reader.GetString(8),
                    IsFavorite = reader.GetInt32(9) != 0
                };

                ticketsByCode[ticket.Code] = ticket;
                data.Tickets.Add(ticket);
            }
        }

        using (var command = CreateCommand(connection, null, """
            SELECT id, ticket_code, created_at_utc, text
            FROM notes
            ORDER BY created_at_utc;
            """))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                if (!ticketsByCode.TryGetValue(reader.GetString(1), out var ticket))
                {
                    continue;
                }

                ticket.Notes.Add(new TicketNote
                {
                    Id = Guid.Parse(reader.GetString(0)),
                    CreatedAt = FromStorageDateTime(reader.GetString(2)),
                    Text = reader.GetString(3)
                });
            }
        }

        using (var command = CreateCommand(connection, null, """
            SELECT id, ticket_code, document_type, original_file_name, stored_relative_path, size_bytes, added_at_utc
            FROM attachments
            ORDER BY added_at_utc;
            """))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                if (!ticketsByCode.TryGetValue(reader.GetString(1), out var ticket))
                {
                    continue;
                }

                ticket.Attachments.Add(new TicketAttachment
                {
                    Id = Guid.Parse(reader.GetString(0)),
                    DocumentType = reader.GetString(2),
                    OriginalFileName = reader.GetString(3),
                    StoredRelativePath = reader.GetString(4),
                    SizeBytes = reader.GetInt64(5),
                    AddedAt = FromStorageDateTime(reader.GetString(6))
                });
            }
        }

        using (var command = CreateCommand(connection, null, """
            SELECT id, ticket_code, started_at_utc, ended_at_utc
            FROM time_entries
            ORDER BY started_at_utc;
            """))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                data.TimeEntries.Add(ReadTimeEntry(reader));
            }
        }

        using (var command = CreateCommand(connection, null, """
            SELECT last_ticket_code, last_checkpoint_utc, theme, language
            FROM app_state
            WHERE id = 1;
            """))
        using (var reader = command.ExecuteReader())
        {
            if (reader.Read())
            {
                data.LastTicketCode = reader.IsDBNull(0) ? null : reader.GetString(0);
                data.LastCheckpointAt = reader.IsDBNull(1) ? default : FromStorageDateTime(reader.GetString(1));
                data.Theme = reader.IsDBNull(2) ? "light" : reader.GetString(2);
                data.Language = reader.IsDBNull(3) ? "pt" : reader.GetString(3);
            }
        }

        Normalize(data);
        return data;
    }

    public void Save(AppData data)
    {
        Normalize(data);
        EnsureDatabase();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        ExecuteNonQuery(connection, transaction, "DELETE FROM attachments;");
        ExecuteNonQuery(connection, transaction, "DELETE FROM notes;");
        ExecuteNonQuery(connection, transaction, "DELETE FROM time_entries;");
        ExecuteNonQuery(connection, transaction, "DELETE FROM tickets;");
        ExecuteNonQuery(connection, transaction, "DELETE FROM app_state;");

        foreach (var ticket in data.Tickets)
        {
            ExecuteNonQuery(connection, transaction, """
                INSERT INTO tickets (
                    code, created_at_utc, updated_at_utc, problem_context, analysis, actions, solution, tests, pending, is_favorite)
                VALUES ($code, $createdAt, $updatedAt, $context, $analysis, $actions, $solution, $tests, $pending, $isFavorite);
                """,
                ("$code", ticket.Code),
                ("$createdAt", ToStorageDateTime(ticket.CreatedAt)),
                ("$updatedAt", ToStorageDateTime(ticket.UpdatedAt)),
                ("$context", ticket.Context),
                ("$analysis", ticket.Analysis),
                ("$actions", ticket.Actions),
                ("$solution", ticket.Solution),
                ("$tests", ticket.Tests),
                ("$pending", ticket.Pending),
                ("$isFavorite", ticket.IsFavorite ? 1 : 0));
        }

        foreach (var entry in data.TimeEntries)
        {
            ExecuteNonQuery(connection, transaction, """
                INSERT INTO time_entries (id, ticket_code, started_at_utc, ended_at_utc)
                VALUES ($id, $ticketCode, $startedAt, $endedAt);
                """,
                ("$id", entry.Id.ToString("D")),
                ("$ticketCode", entry.TicketCode),
                ("$startedAt", ToStorageDateTime(entry.StartedAt)),
                ("$endedAt", entry.EndedAt is null ? null : ToStorageDateTime(entry.EndedAt.Value)));
        }

        foreach (var ticket in data.Tickets)
        {
            foreach (var note in ticket.Notes)
            {
                ExecuteNonQuery(connection, transaction, """
                    INSERT INTO notes (id, ticket_code, created_at_utc, text)
                    VALUES ($id, $ticketCode, $createdAt, $text);
                    """,
                    ("$id", note.Id.ToString("D")),
                    ("$ticketCode", ticket.Code),
                    ("$createdAt", ToStorageDateTime(note.CreatedAt)),
                    ("$text", note.Text));
            }

            foreach (var attachment in ticket.Attachments)
            {
                ExecuteNonQuery(connection, transaction, """
                    INSERT INTO attachments (
                        id, ticket_code, document_type, original_file_name, stored_relative_path, size_bytes, added_at_utc)
                    VALUES ($id, $ticketCode, $documentType, $fileName, $storedPath, $sizeBytes, $addedAt);
                    """,
                    ("$id", attachment.Id.ToString("D")),
                    ("$ticketCode", ticket.Code),
                    ("$documentType", attachment.DocumentType),
                    ("$fileName", attachment.OriginalFileName),
                    ("$storedPath", attachment.StoredRelativePath),
                    ("$sizeBytes", attachment.SizeBytes),
                    ("$addedAt", ToStorageDateTime(attachment.AddedAt)));
            }
        }

        ExecuteNonQuery(connection, transaction, """
            INSERT INTO app_state (id, last_ticket_code, last_checkpoint_utc, theme, language)
            VALUES (1, $lastTicketCode, $lastCheckpoint, $theme, $language);
            """,
            ("$lastTicketCode", data.LastTicketCode),
            ("$lastCheckpoint", data.LastCheckpointAt == default ? null : ToStorageDateTime(data.LastCheckpointAt)),
            ("$theme", data.Theme ?? "light"),
            ("$language", data.Language ?? "pt"));

        transaction.Commit();
    }

    public List<TimeEntry> QueryAllTimeEntries()
    {
        EnsureDatabase();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT id, ticket_code, started_at_utc, ended_at_utc
            FROM time_entries
            ORDER BY started_at_utc;
            """);

        using var reader = command.ExecuteReader();
        var entries = new List<TimeEntry>();
        while (reader.Read())
        {
            entries.Add(ReadTimeEntry(reader));
        }

        return entries;
    }

    public List<TimeEntry> QueryTimeEntriesOverlapping(DateTime startInclusive, DateTime endExclusive)
    {
        EnsureDatabase();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT id, ticket_code, started_at_utc, ended_at_utc
            FROM time_entries
            WHERE started_at_utc < $endExclusive
              AND (ended_at_utc IS NULL OR ended_at_utc > $startInclusive)
            ORDER BY started_at_utc;
            """,
            ("$startInclusive", ToStorageDateTime(startInclusive)),
            ("$endExclusive", ToStorageDateTime(endExclusive)));

        using var reader = command.ExecuteReader();
        var entries = new List<TimeEntry>();
        while (reader.Read())
        {
            entries.Add(ReadTimeEntry(reader));
        }

        return entries;
    }

    public string CopyAttachment(string ticketCode, string sourceFile)
    {
        if (!File.Exists(sourceFile))
        {
            throw new FileNotFoundException("O arquivo selecionado não foi encontrado.", sourceFile);
        }

        var ticketDirectory = Path.Combine(AttachmentsDirectory, SanitizePathSegment(ticketCode));
        Directory.CreateDirectory(ticketDirectory);

        var originalName = Path.GetFileName(sourceFile);
        var safeName = SanitizeFileName(originalName);
        var destinationName = $"{Guid.NewGuid():N}_{safeName}";
        var destinationFile = Path.Combine(ticketDirectory, destinationName);

        File.Copy(sourceFile, destinationFile, overwrite: false);
        return Path.GetRelativePath(DataDirectory, destinationFile);
    }

    public string GetAttachmentFullPath(string storedRelativePath)
    {
        var attachmentsRoot = Path.GetFullPath(AttachmentsDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var attachmentPath = Path.GetFullPath(Path.Combine(DataDirectory, storedRelativePath));

        if (!attachmentPath.StartsWith(attachmentsRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("O caminho do anexo não pertence ao repositório local do Controlador.");
        }

        return attachmentPath;
    }

    public void DeleteAttachment(string storedRelativePath)
    {
        var attachmentPath = GetAttachmentFullPath(storedRelativePath);
        if (File.Exists(attachmentPath))
        {
            File.Delete(attachmentPath);
        }
    }

    public string CreateBackup()
    {
        var backupDirectory = Path.Combine(DataDirectory, "backups");
        Directory.CreateDirectory(backupDirectory);

        var backupFile = Path.Combine(
            backupDirectory,
            $"controlador-{DateTime.Now:yyyyMMdd-HHmmss}.zip");
        CreateBackupArchive(backupFile, overwrite: false);
        return backupFile;
    }

    public void ExportBackup(string destinationFile)
    {
        CreateBackupArchive(destinationFile, overwrite: true);
    }

    public void ImportBackup(string archiveFile)
    {
        if (!File.Exists(archiveFile))
        {
            throw new FileNotFoundException("O arquivo de backup selecionado não foi encontrado.", archiveFile);
        }

        var stagingDirectory = Path.Combine(Path.GetTempPath(), "Controlador", $"import-{Guid.NewGuid():N}");
        Directory.CreateDirectory(stagingDirectory);

        try
        {
            ExtractBackupArchive(archiveFile, stagingDirectory);
            var importedDatabase = Path.Combine(stagingDirectory, "controlador.db");
            ValidateDatabase(importedDatabase);
            ReplaceLocalData(importedDatabase, Path.Combine(stagingDirectory, "attachments"));
        }
        finally
        {
            if (Directory.Exists(stagingDirectory))
            {
                Directory.Delete(stagingDirectory, recursive: true);
            }
        }
    }

    private void EnsureDatabase()
    {
        Directory.CreateDirectory(DataDirectory);

        using var connection = OpenConnection();
        ExecuteNonQuery(connection, null, "PRAGMA journal_mode = WAL;");
        ExecuteNonQuery(connection, null, "PRAGMA foreign_keys = ON;");
        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS tickets (
                code TEXT PRIMARY KEY COLLATE NOCASE,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
                problem_context TEXT NOT NULL DEFAULT '',
                analysis TEXT NOT NULL DEFAULT '',
                actions TEXT NOT NULL DEFAULT '',
                solution TEXT NOT NULL DEFAULT '',
                tests TEXT NOT NULL DEFAULT '',
                pending TEXT NOT NULL DEFAULT '',
                is_favorite INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS time_entries (
                id TEXT PRIMARY KEY,
                ticket_code TEXT NOT NULL,
                started_at_utc TEXT NOT NULL,
                ended_at_utc TEXT NULL,
                FOREIGN KEY (ticket_code) REFERENCES tickets(code) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS ix_time_entries_started_at ON time_entries(started_at_utc);
            CREATE INDEX IF NOT EXISTS ix_time_entries_ticket_started_at ON time_entries(ticket_code, started_at_utc);

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                ticket_code TEXT NOT NULL,
                created_at_utc TEXT NOT NULL,
                text TEXT NOT NULL,
                FOREIGN KEY (ticket_code) REFERENCES tickets(code) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS ix_notes_ticket_created_at ON notes(ticket_code, created_at_utc);

            CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                ticket_code TEXT NOT NULL,
                document_type TEXT NOT NULL,
                original_file_name TEXT NOT NULL,
                stored_relative_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                added_at_utc TEXT NOT NULL,
                FOREIGN KEY (ticket_code) REFERENCES tickets(code) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS ix_attachments_ticket_document_type ON attachments(ticket_code, document_type);

            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_ticket_code TEXT NULL,
                last_checkpoint_utc TEXT NULL,
                theme TEXT NOT NULL DEFAULT 'light',
                language TEXT NOT NULL DEFAULT 'pt'
            );
            """);

        // Migrations for existing databases
        RunMigrationIfNeeded(connection, "ALTER TABLE tickets ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
            "SELECT COUNT(*) FROM pragma_table_info('tickets') WHERE name = 'is_favorite'");
        RunMigrationIfNeeded(connection, "ALTER TABLE app_state ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'",
            "SELECT COUNT(*) FROM pragma_table_info('app_state') WHERE name = 'theme'");
        RunMigrationIfNeeded(connection, "ALTER TABLE app_state ADD COLUMN language TEXT NOT NULL DEFAULT 'pt'",
            "SELECT COUNT(*) FROM pragma_table_info('app_state') WHERE name = 'language'");
    }

    private static void RunMigrationIfNeeded(SqliteConnection connection, string alterSql, string checkSql)
    {
        using var checkCmd = CreateCommand(connection, null, checkSql);
        var count = Convert.ToInt32(checkCmd.ExecuteScalar());
        if (count == 0)
        {
            ExecuteNonQuery(connection, null, alterSql);
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = DatabaseFile,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        }.ToString();

        var connection = new SqliteConnection(connectionString);
        connection.Open();
        ExecuteNonQuery(connection, null, "PRAGMA foreign_keys = ON;");
        return connection;
    }

    private void CreateBackupArchive(string destinationFile, bool overwrite)
    {
        EnsureDatabase();
        CheckpointDatabase();

        var destinationDirectory = Path.GetDirectoryName(destinationFile);
        if (string.IsNullOrWhiteSpace(destinationDirectory))
        {
            throw new IOException("O destino do backup é inválido.");
        }

        Directory.CreateDirectory(destinationDirectory);
        if (File.Exists(destinationFile))
        {
            if (!overwrite)
            {
                throw new IOException("Já existe um backup com esse nome.");
            }

            File.Delete(destinationFile);
        }

        using var archive = ZipFile.Open(destinationFile, ZipArchiveMode.Create);
        archive.CreateEntryFromFile(DatabaseFile, "controlador.db", CompressionLevel.Optimal);

        if (!Directory.Exists(AttachmentsDirectory))
        {
            return;
        }

        foreach (var attachmentFile in Directory.EnumerateFiles(AttachmentsDirectory, "*", SearchOption.AllDirectories))
        {
            var entryName = Path.GetRelativePath(DataDirectory, attachmentFile).Replace('\\', '/');
            archive.CreateEntryFromFile(attachmentFile, entryName, CompressionLevel.Optimal);
        }
    }

    private void CheckpointDatabase()
    {
        using (var connection = OpenConnection())
        {
            ExecuteNonQuery(connection, null, "PRAGMA wal_checkpoint(TRUNCATE);");
        }

        SqliteConnection.ClearAllPools();
    }

    private void ExtractBackupArchive(string archiveFile, string stagingDirectory)
    {
        using var archive = ZipFile.OpenRead(archiveFile);
        long totalUncompressedSize = 0;
        var hasDatabase = false;

        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrEmpty(entry.Name))
            {
                continue;
            }

            var entryName = entry.FullName.Replace('\\', '/');
            var allowedEntry = string.Equals(entryName, "controlador.db", StringComparison.OrdinalIgnoreCase) ||
                               entryName.StartsWith("attachments/", StringComparison.OrdinalIgnoreCase);
            if (!allowedEntry)
            {
                throw new InvalidDataException("O backup contém arquivos que não pertencem ao Controlador.");
            }

            totalUncompressedSize += entry.Length;
            if (totalUncompressedSize > MaximumImportSizeBytes)
            {
                throw new InvalidDataException("O backup ultrapassa o tamanho máximo aceito para importação.");
            }

            var destinationFile = GetSafeArchiveDestination(stagingDirectory, entryName);
            Directory.CreateDirectory(Path.GetDirectoryName(destinationFile)!);
            entry.ExtractToFile(destinationFile, overwrite: true);
            hasDatabase |= string.Equals(entryName, "controlador.db", StringComparison.OrdinalIgnoreCase);
        }

        if (!hasDatabase)
        {
            throw new InvalidDataException("O backup não contém o banco de dados do Controlador.");
        }
    }

    private void ValidateDatabase(string databaseFile)
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databaseFile,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false
        }.ToString();

        using var connection = new SqliteConnection(connectionString);
        connection.Open();

        using (var integrityCommand = CreateCommand(connection, null, "PRAGMA integrity_check;"))
        {
            var result = integrityCommand.ExecuteScalar()?.ToString();
            if (!string.Equals(result, "ok", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException("O banco de dados do backup não passou na verificação de integridade.");
            }
        }

        using var schemaCommand = CreateCommand(connection, null, """
            SELECT COUNT(*)
            FROM sqlite_master
            WHERE type = 'table' AND name IN ('tickets', 'time_entries', 'notes', 'attachments', 'app_state');
            """);
        var tableCount = Convert.ToInt32(schemaCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        if (tableCount != 5)
        {
            throw new InvalidDataException("O backup não possui a estrutura esperada pelo Controlador.");
        }
    }

    private void ReplaceLocalData(string importedDatabase, string importedAttachmentsDirectory)
    {
        Directory.CreateDirectory(DataDirectory);

        var replacementId = Guid.NewGuid().ToString("N");
        var replacementDatabase = Path.Combine(DataDirectory, $"import-{replacementId}.db");
        var replacementAttachments = Path.Combine(DataDirectory, $"attachments-import-{replacementId}");
        var previousDatabase = Path.Combine(DataDirectory, $"previous-{replacementId}.db");
        var previousAttachments = Path.Combine(DataDirectory, $"attachments-previous-{replacementId}");
        var movedExistingDatabase = false;
        var movedExistingAttachments = false;
        var installedReplacementDatabase = false;
        var installedReplacementAttachments = false;

        File.Copy(importedDatabase, replacementDatabase, overwrite: true);
        Directory.CreateDirectory(replacementAttachments);
        if (Directory.Exists(importedAttachmentsDirectory))
        {
            CopyDirectory(importedAttachmentsDirectory, replacementAttachments);
        }

        try
        {
            DeleteDatabaseSidecars();

            if (File.Exists(DatabaseFile))
            {
                File.Move(DatabaseFile, previousDatabase);
                movedExistingDatabase = true;
            }

            if (Directory.Exists(AttachmentsDirectory))
            {
                Directory.Move(AttachmentsDirectory, previousAttachments);
                movedExistingAttachments = true;
            }

            File.Move(replacementDatabase, DatabaseFile);
            installedReplacementDatabase = true;
            Directory.Move(replacementAttachments, AttachmentsDirectory);
            installedReplacementAttachments = true;

            if (movedExistingDatabase && File.Exists(previousDatabase))
            {
                File.Delete(previousDatabase);
            }

            if (movedExistingAttachments && Directory.Exists(previousAttachments))
            {
                Directory.Delete(previousAttachments, recursive: true);
            }
        }
        catch
        {
            if (installedReplacementDatabase && File.Exists(DatabaseFile))
            {
                File.Delete(DatabaseFile);
            }

            if (installedReplacementAttachments && Directory.Exists(AttachmentsDirectory))
            {
                Directory.Delete(AttachmentsDirectory, recursive: true);
            }

            if (movedExistingDatabase && File.Exists(previousDatabase) && !File.Exists(DatabaseFile))
            {
                File.Move(previousDatabase, DatabaseFile);
            }

            if (movedExistingAttachments && Directory.Exists(previousAttachments) && !Directory.Exists(AttachmentsDirectory))
            {
                Directory.Move(previousAttachments, AttachmentsDirectory);
            }

            throw;
        }
        finally
        {
            if (File.Exists(replacementDatabase))
            {
                File.Delete(replacementDatabase);
            }

            if (Directory.Exists(replacementAttachments))
            {
                Directory.Delete(replacementAttachments, recursive: true);
            }
        }
    }

    private void DeleteDatabaseSidecars()
    {
        foreach (var suffix in new[] { "-wal", "-shm" })
        {
            var sidecar = DatabaseFile + suffix;
            if (File.Exists(sidecar))
            {
                File.Delete(sidecar);
            }
        }
    }

    private static void CopyDirectory(string sourceDirectory, string destinationDirectory)
    {
        foreach (var directory in Directory.EnumerateDirectories(sourceDirectory, "*", SearchOption.AllDirectories))
        {
            var relativeDirectory = Path.GetRelativePath(sourceDirectory, directory);
            Directory.CreateDirectory(Path.Combine(destinationDirectory, relativeDirectory));
        }

        foreach (var sourceFile in Directory.EnumerateFiles(sourceDirectory, "*", SearchOption.AllDirectories))
        {
            var relativeFile = Path.GetRelativePath(sourceDirectory, sourceFile);
            var destinationFile = Path.Combine(destinationDirectory, relativeFile);
            Directory.CreateDirectory(Path.GetDirectoryName(destinationFile)!);
            File.Copy(sourceFile, destinationFile, overwrite: true);
        }
    }

    private static string GetSafeArchiveDestination(string stagingDirectory, string entryName)
    {
        var normalizedEntryName = entryName.Replace('/', Path.DirectorySeparatorChar);
        var stagingRoot = Path.GetFullPath(stagingDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var destination = Path.GetFullPath(Path.Combine(stagingDirectory, normalizedEntryName));

        if (!destination.StartsWith(stagingRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("O backup possui um caminho de arquivo inválido.");
        }

        return destination;
    }

    private static TimeEntry ReadTimeEntry(SqliteDataReader reader)
    {
        return new TimeEntry
        {
            Id = Guid.Parse(reader.GetString(0)),
            TicketCode = reader.GetString(1),
            StartedAt = FromStorageDateTime(reader.GetString(2)),
            EndedAt = reader.IsDBNull(3) ? null : FromStorageDateTime(reader.GetString(3))
        };
    }

    private static void Normalize(AppData data)
    {
        data.Tickets ??= [];
        data.TimeEntries ??= [];

        foreach (var ticket in data.Tickets)
        {
            ticket.Notes ??= [];
            ticket.Attachments ??= [];
        }
    }

    private static SqliteCommand CreateCommand(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string commandText,
        params (string Name, object? Value)[] parameters)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = commandText;

        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        return command;
    }

    private static void ExecuteNonQuery(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string commandText,
        params (string Name, object? Value)[] parameters)
    {
        using var command = CreateCommand(connection, transaction, commandText, parameters);
        command.ExecuteNonQuery();
    }

    private static string ToStorageDateTime(DateTime value)
    {
        var normalized = value.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(value, DateTimeKind.Local)
            : value;
        return normalized.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    }

    private static DateTime FromStorageDateTime(string value)
    {
        return DateTime.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToLocalTime();
    }

    private static string SanitizePathSegment(string value)
    {
        var invalidCharacters = Path.GetInvalidFileNameChars();
        var sanitized = string.Concat(value.Select(character => invalidCharacters.Contains(character) ? '_' : character));
        sanitized = sanitized.Trim().Trim('.');
        return string.IsNullOrWhiteSpace(sanitized) ? "sem-chamado" : sanitized;
    }

    private static string SanitizeFileName(string value)
    {
        var sanitized = SanitizePathSegment(value);
        return string.IsNullOrWhiteSpace(sanitized) ? "arquivo" : sanitized;
    }
}
