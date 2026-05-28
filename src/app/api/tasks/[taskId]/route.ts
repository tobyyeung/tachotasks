import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request, 
  context: { params: Promise<{ taskId: string }> } 
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { completed } = body;

    // 1. We MUST await the context.params object first
    const resolvedParams = await context.params;
    const taskId = resolvedParams.taskId;

    // 2. Now we can safely pass the awaited taskId into Prisma
    await prisma.task.updateMany({
      where: {
        id: taskId,
        userId: session.user.id, 
      },
      data: { 
        completed 
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request, 
  context: { params: Promise<{ taskId: string }> } 
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. We MUST await the context.params object first
    const resolvedParams = await context.params;
    const taskId = resolvedParams.taskId;

    // 2. Now we can safely pass the awaited taskId into Prisma
    await prisma.task.deleteMany({
      where: {
        id: taskId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}