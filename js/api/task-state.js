// Active and archived tasks are two views of the same ID, not independent entities.
export function cleanTaskRecord(task) {
  const clean = { ...task };
  for (const key of ['isCompleting', 'completionTimeout', 'scheduledStartTime', 'scheduledEndTime', 'scheduledDate', 'isInbox']) {
    delete clean[key];
  }
  return clean;
}

function taskTimestamp(task) {
  return Date.parse(task.updatedAt || task.completedAt || task.createdAt) || 0;
}

export function taskRecordsEqual(left, right) {
  const stable = value => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  };
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function reconcileTaskCollections(local, remote, tombstones = {}) {
  const winners = new Map();
  for (const source of [remote, local]) {
    for (const key of ['tasks', 'archivedTasks']) {
      for (const record of source[key] || []) {
        if (!record?.id) continue;
        const task = cleanTaskRecord(record);
        const archived = key === 'archivedTasks' || task.completed === true;
        const candidate = { task, archived };
        const previous = winners.get(task.id);
        const time = taskTimestamp(task);
        const previousTime = previous ? taskTimestamp(previous.task) : -1;
        // Completion wins equal timestamps, so stale active copies cannot revive it.
        if (!previous || time > previousTime || (time === previousTime && archived && !previous.archived)) {
          winners.set(task.id, candidate);
        }
      }
    }
  }
  const result = { tasks: [], archivedTasks: [] };
  for (const { task, archived } of winners.values()) {
    const deletedAt = Date.parse(tombstones[task.id]?.deletedAt) || 0;
    if (deletedAt && deletedAt >= taskTimestamp(task)) continue;
    result[archived ? 'archivedTasks' : 'tasks'].push(task);
  }
  return result;
}

// Keep task writes and sync application ordered, including asynchronous SQLite IPC.
let taskStoreQueue = Promise.resolve();
export function withTaskStoreLock(operation) {
  const result = taskStoreQueue.then(operation);
  taskStoreQueue = result.catch(() => {});
  return result;
}

export async function readTaskCollections() {
  const normalize = data => reconcileTaskCollections(data, { tasks: [], archivedTasks: [] });
  if (window.electronStorage?.getTaskCollections) return normalize(await window.electronStorage.getTaskCollections());
  if (window.electronStorage) {
    const [tasks, archivedTasks] = await Promise.all([
      window.electronStorage.getTasks(), window.electronStorage.getArchivedTasks()
    ]);
    return normalize({ tasks, archivedTasks });
  }
  return normalize({
    tasks: JSON.parse(localStorage.getItem('tachotasks.tasks') || '[]'),
    archivedTasks: JSON.parse(localStorage.getItem('tachotasks.archivedTasks') || '[]')
  });
}

export async function writeTaskCollections(data) {
  // Deduplicate by stable ID before either persistence backend sees the data.
  // Different tasks with the same title remain independent.
  data = reconcileTaskCollections(data, { tasks: [], archivedTasks: [] });
  if (window.electronStorage?.saveTaskCollections) {
    await window.electronStorage.saveTaskCollections(data);
  } else if (window.electronStorage) {
    await window.electronStorage.saveTasks(data.tasks);
    await window.electronStorage.saveArchivedTasks(data.archivedTasks);
  }
  localStorage.setItem('tachotasks.tasks', JSON.stringify(data.tasks));
  localStorage.setItem('tachotasks.archivedTasks', JSON.stringify(data.archivedTasks));
}
