import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchWithAuth } from "./api";
import {
  compactNotificationReadQueue,
  type NotificationReadOperation,
} from "./notificationState";

const queueKey = (userId: string) => `notifications-read-queue:${userId}`;
const queueLocks = new Map<string, Promise<unknown>>();

async function withQueueLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  queueLocks.set(userId, current);
  try {
    return await current;
  } finally {
    if (queueLocks.get(userId) === current) queueLocks.delete(userId);
  }
}

async function readQueue(userId: string): Promise<NotificationReadOperation[]> {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(userId: string, queue: NotificationReadOperation[]): Promise<void> {
  if (queue.length === 0) await AsyncStorage.removeItem(queueKey(userId));
  else await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

export async function enqueueNotificationRead(
  userId: string,
  operation: NotificationReadOperation,
): Promise<void> {
  await withQueueLock(userId, async () => {
    const queue = await readQueue(userId);
    await writeQueue(userId, compactNotificationReadQueue(queue, operation));
  });
}

export async function flushNotificationReadQueue(userId: string): Promise<boolean> {
  return withQueueLock(userId, async () => {
    const queue = await readQueue(userId);
    let completed = 0;
    for (const operation of queue) {
      const body = operation.kind === "read"
        ? { action: "read", id: operation.id }
        : { action: "read_all", through: operation.through };
      try {
        const response = await fetchWithAuth("/notifications", {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (!response.ok) break;
        completed += 1;
      } catch {
        break;
      }
    }
    await writeQueue(userId, queue.slice(completed));
    return completed === queue.length;
  });
}

export async function clearNotificationReadQueue(userId: string): Promise<void> {
  await withQueueLock(userId, () => AsyncStorage.removeItem(queueKey(userId)));
}
