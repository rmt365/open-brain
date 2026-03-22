// Open Brain - Backup Health Check
// Checks Litestream backup status by examining database file activity

export interface BackupHealthStatus {
  status: "healthy" | "warning" | "error" | "disabled";
  enabled: boolean;
  lastActivity: string | null;
  lagSeconds: number;
  dbSizeBytes: number | null;
}

/**
 * Check backup health by examining database file modification times.
 *
 * When Litestream is replicating, it regularly checkpoints the WAL file,
 * which updates the mtime of the WAL, SHM, or main DB file. We use the
 * most recent mtime across all three to estimate replication lag.
 *
 * Thresholds:
 *   < 300s (5 min)  = healthy
 *   < 1800s (30 min) = warning
 *   >= 1800s         = error
 */
export async function getBackupHealth(
  enableLitestream: boolean,
  databasePath: string,
): Promise<BackupHealthStatus> {
  if (!enableLitestream) {
    return {
      status: "disabled",
      enabled: false,
      lastActivity: null,
      lagSeconds: 0,
      dbSizeBytes: null,
    };
  }

  try {
    const walPath = `${databasePath}-wal`;
    const shmPath = `${databasePath}-shm`;

    // Stat all three files, collecting available mtimes
    const mtimes: Date[] = [];
    let dbSizeBytes: number | null = null;

    try {
      const dbStat = await Deno.stat(databasePath);
      if (dbStat.mtime) mtimes.push(dbStat.mtime);
      dbSizeBytes = dbStat.size;
    } catch {
      // Main DB missing is a hard error
      return {
        status: "error",
        enabled: true,
        lastActivity: null,
        lagSeconds: -1,
        dbSizeBytes: null,
      };
    }

    // WAL and SHM are optional (DB may be idle / checkpointed)
    for (const path of [walPath, shmPath]) {
      try {
        const stat = await Deno.stat(path);
        if (stat.mtime) mtimes.push(stat.mtime);
      } catch {
        // File doesn't exist — that's fine
      }
    }

    const lastActivity = mtimes.length > 0
      ? new Date(Math.max(...mtimes.map((d) => d.getTime())))
      : null;

    if (!lastActivity) {
      return {
        status: "error",
        enabled: true,
        lastActivity: null,
        lagSeconds: -1,
        dbSizeBytes,
      };
    }

    const lagSeconds = Math.round((Date.now() - lastActivity.getTime()) / 1000);

    let status: BackupHealthStatus["status"];
    if (lagSeconds < 300) {
      status = "healthy";
    } else if (lagSeconds < 1800) {
      status = "warning";
    } else {
      status = "error";
    }

    return {
      status,
      enabled: true,
      lastActivity: lastActivity.toISOString(),
      lagSeconds,
      dbSizeBytes,
    };
  } catch {
    return {
      status: "error",
      enabled: true,
      lastActivity: null,
      lagSeconds: -1,
      dbSizeBytes: null,
    };
  }
}
