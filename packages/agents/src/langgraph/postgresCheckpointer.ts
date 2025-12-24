import { desc, eq } from "drizzle-orm";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  getCheckpointId,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from "@langchain/langgraph-checkpoint";
import { getDb } from "@pa-os/db";
import { lgCheckpoints } from "@pa-os/db/schema";

type StoredCheckpointRow = {
  type: "checkpoint";
  checkpointId: string;
  checkpointNs: string;
  checkpoint: Checkpoint;
  metadata: CheckpointMetadata;
  parentCheckpointId?: string;
};

type StoredWritesRow = {
  type: "writes";
  checkpointId: string;
  checkpointNs: string;
  taskId: string;
  writes: Array<[string, string, unknown]>; // [taskId, channel, value]
};

export class PostgresCheckpointer extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    if (!threadId) {
      throw new Error('Missing required config.configurable.thread_id for checkpointing');
    }

    const requestedCheckpointId = getCheckpointId(config);

    const { db } = getDb();

    const checkpoints = await db
      .select({
        id: lgCheckpoints.id,
        checkpointJson: lgCheckpoints.checkpointJson,
        createdAt: lgCheckpoints.createdAt,
      })
      .from(lgCheckpoints)
      .where(eq(lgCheckpoints.threadId, threadId))
      .orderBy(desc(lgCheckpoints.createdAt))
      .limit(200);

    const checkpointRows = checkpoints
      .map((r) => r.checkpointJson as any)
      .filter((r): r is StoredCheckpointRow => r?.type === "checkpoint" && typeof r?.checkpointId === "string");

    const selected =
      requestedCheckpointId
        ? checkpointRows.find((r) => r.checkpointId === requestedCheckpointId && r.checkpointNs === checkpointNs)
        : checkpointRows.find((r) => r.checkpointNs === checkpointNs);

    if (!selected) return undefined;

    const writesRows = checkpoints
      .map((r) => r.checkpointJson as any)
      .filter((r): r is StoredWritesRow => r?.type === "writes" && r?.checkpointId === selected.checkpointId)
      .flatMap((r) => r.writes ?? []);

    const pendingWrites = writesRows as any;

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: selected.checkpointNs,
          checkpoint_id: selected.checkpointId,
        },
      },
      checkpoint: selected.checkpoint,
      metadata: selected.metadata,
      pendingWrites,
    };

    if (selected.parentCheckpointId) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: selected.checkpointNs,
          checkpoint_id: selected.parentCheckpointId,
        },
      };
    }

    return tuple;
  }

  async *list(config: RunnableConfig, options?: { limit?: number }) {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('Missing required config.configurable.thread_id for checkpointing');
    }
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const limit = options?.limit ?? 50;

    const { db } = getDb();
    const rows = await db
      .select({ checkpointJson: lgCheckpoints.checkpointJson, createdAt: lgCheckpoints.createdAt })
      .from(lgCheckpoints)
      .where(eq(lgCheckpoints.threadId, threadId))
      .orderBy(desc(lgCheckpoints.createdAt))
      .limit(500);

    const checkpoints = rows
      .map((r) => r.checkpointJson as any)
      .filter((r): r is StoredCheckpointRow => r?.type === "checkpoint" && r?.checkpointNs === checkpointNs);

    for (const row of checkpoints.slice(0, limit)) {
      const tuple = await this.getTuple({
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: row.checkpointId,
        },
      });
      if (tuple) yield tuple;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, string | number>,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    if (!threadId) {
      throw new Error('Missing required config.configurable.thread_id for checkpointing');
    }

    const parentCheckpointId = config.configurable?.checkpoint_id as string | undefined;

    const row: StoredCheckpointRow = {
      type: "checkpoint",
      checkpointId: checkpoint.id,
      checkpointNs,
      checkpoint,
      metadata,
      parentCheckpointId,
    };

    const { db } = getDb();
    await db.insert(lgCheckpoints).values({
      threadId,
      checkpointJson: row as any,
      createdAt: new Date(),
    });

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (!threadId) {
      throw new Error('Missing required config.configurable.thread_id for checkpointing');
    }
    if (!checkpointId) {
      throw new Error('Missing required config.configurable.checkpoint_id for checkpointing writes');
    }

    const row: StoredWritesRow = {
      type: "writes",
      checkpointId,
      checkpointNs,
      taskId,
      writes: writes.map(([channel, value]) => [taskId, String(channel), value]),
    };

    const { db } = getDb();
    await db.insert(lgCheckpoints).values({
      threadId,
      checkpointJson: row as any,
      createdAt: new Date(),
    });
  }

  async deleteThread(threadId: string) {
    const { db } = getDb();
    await db.delete(lgCheckpoints).where(eq(lgCheckpoints.threadId, threadId));
  }
}


