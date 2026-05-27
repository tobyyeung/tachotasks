"use client";

import { signIn } from "next-auth/react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white gap-6">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-2">TachoTasks</h1>
        <p className="text-zinc-400">Sync your focus. Master your calendar.</p>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="px-6 py-3 bg-white text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
      >
        Sign in with Google
      </button>
    </main>
  );
}