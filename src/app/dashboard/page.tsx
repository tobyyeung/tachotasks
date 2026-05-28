import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TaskManager from "./TaskManager";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  // Securely fetch all lists and their associated tasks for this specific user
  const userLists = await prisma.list.findMany({
    where: { 
      userId: session.user.id 
    },
    include: { 
      tasks: {
        orderBy: { createdAt: 'asc' } // Keep tasks in the order they were created
      } 
    },
    orderBy: { 
      createdAt: 'desc' // Show newest lists at the top
    }
  });

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold">Welcome back, {session.user?.name?.split(" ")[0]}!</h1>
            <p className="text-zinc-400 mt-1">Here is your TachoTasks dashboard.</p>
          </div>
          
          {session.user?.image && (
            <img 
              src={session.user.image} 
              alt="Profile" 
              className="w-12 h-12 rounded-full border-2 border-zinc-800 shadow-lg"
            />
          )}
        </header>

        {/* Our interactive React component */}
        <TaskManager initialLists={userLists} />
        
      </div>
    </main>
  );
}