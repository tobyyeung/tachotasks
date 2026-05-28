"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 1. Updated our Task type so TypeScript knows about dates and Google IDs
type Task = { 
  id: string; 
  title: string; 
  completed: boolean;
  dueDate?: string | null;
  googleEventId?: string | null;
};
type List = { id: string; title: string; tasks: Task[] };

export default function TaskManager({ initialLists }: { initialLists: List[] }) {
  const router = useRouter();
  
  const [listTitle, setListTitle] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [selectedListId, setSelectedListId] = useState(initialLists[0]?.id || "");
  const [dueDate, setDueDate] = useState(""); // 2. New state for our date picker
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!selectedListId && initialLists.length > 0) {
      setSelectedListId(initialLists[0].id);
    }
  }, [initialLists, selectedListId]);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listTitle) return;
    setIsPending(true);

    await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: listTitle }),
    });

    setListTitle("");
    setIsPending(false);
    router.refresh();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle || !selectedListId) return;
    setIsPending(true);

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 3. Send the dueDate to our backend API!
      body: JSON.stringify({ 
        title: taskTitle, 
        listId: selectedListId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null 
      }),
    });

    setTaskTitle("");
    setDueDate(""); // Clear the date picker after saving
    setIsPending(false);
    router.refresh();
  };

  const handleToggleTask = async (taskId: string, currentStatus: boolean) => {
    setIsPending(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !currentStatus }), 
    });
    setIsPending(false);
    router.refresh();
  };

  const handleDeleteTask = async (taskId: string) => {
    setIsPending(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
    setIsPending(false);
    router.refresh();
  };

  return (
    <div className="space-y-8 mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Create List Form */}
        <form onSubmit={handleCreateList} className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
          <h2 className="text-xl font-semibold mb-4 text-white">Create a List</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
              placeholder="e.g., Grocery List"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-zinc-500"
              disabled={isPending}
            />
            <button type="submit" disabled={isPending} className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-zinc-200 disabled:opacity-50">
              Add
            </button>
          </div>
        </form>

        {/* Create Task Form */}
        <form onSubmit={handleCreateTask} className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
          <h2 className="text-xl font-semibold mb-4 text-white">Add a Task</h2>
          {initialLists.length === 0 ? (
            <p className="text-zinc-400 text-sm">Create a list first before adding tasks!</p>
          ) : (
            <div className="flex flex-col gap-3">
              <select 
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none"
              >
                <option value="" disabled>Select a list...</option>
                {initialLists.map(list => (
                  <option key={list.id} value={list.id}>{list.title}</option>
                ))}
              </select>
              
              {/* 4. Updated layout to stack the title input and date picker beautifully */}
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g., Buy milk"
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-zinc-500"
                  disabled={isPending}
                />
                <div className="flex gap-2">
                  {/* The native browser date/time picker */}
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-400 focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
                    disabled={isPending}
                  />
                  <button type="submit" disabled={isPending} className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-zinc-200 disabled:opacity-50 whitespace-nowrap">
                    Add Task
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* DISPLAY SECTION */}
      <div className="space-y-6">
        {initialLists.map(list => (
          <div key={list.id} className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <h3 className="text-2xl font-bold text-white mb-4">{list.title}</h3>
            {list.tasks.length === 0 ? (
              <p className="text-zinc-500 italic">No tasks in this list yet.</p>
            ) : (
              <ul className="space-y-2">
                {list.tasks.map(task => (
                  <li key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800/50 hover:border-zinc-700 transition-colors gap-3">
                    
                    <div className="flex items-start gap-3">
                      <input 
                        type="checkbox" 
                        checked={task.completed} 
                        onChange={() => handleToggleTask(task.id, task.completed)}
                        disabled={isPending}
                        className="w-5 h-5 accent-zinc-500 cursor-pointer flex-shrink-0 mt-0.5" 
                      />
                      <div className="flex flex-col">
                        <span className={`text-zinc-200 ${task.completed ? "line-through text-zinc-500" : ""}`}>
                          {task.title}
                        </span>
                        
                        {/* 5. Shows exactly when the task is due, and a shiny badge if it synced! */}
                        {task.dueDate && (
                          <span className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5">
                            <span className="opacity-70">📅</span> 
                            {new Date(task.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            {task.googleEventId && (
                              <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full ml-2 font-medium">
                                Synced to Calendar
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      disabled={isPending}
                      className="text-red-400/70 hover:text-red-400 text-sm font-medium px-2 py-1 rounded hover:bg-red-950/30 transition-all sm:self-auto self-end"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}