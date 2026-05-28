import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    // 1. Check if the user is logged in securely on the server
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Grab the list title from the frontend request
    const body = await request.json();
    const { title } = body;

    if (!title) {
      return NextResponse.json({ error: "List title is required" }, { status: 400 });
    }

    // 3. Save the new list to the database
    const newList = await prisma.list.create({
      data: {
        title,
        userId: session.user.id, // Locks the list to the logged-in user
      },
    });

    return NextResponse.json(newList, { status: 201 });
  } catch (error) {
    console.error("Error creating list:", error);
    return NextResponse.json({ error: "Failed to create list" }, { status: 500 });
  }
}