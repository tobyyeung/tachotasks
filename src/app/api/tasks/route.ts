import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getCalendarClient } from "@/lib/google"; // <-- Our new helper!

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { title, listId, dueDate } = body;

    if (!title || !listId) return NextResponse.json({ error: "Title and List ID required" }, { status: 400 });

    let googleEventId = null;

    // --- NEW CALENDAR LOGIC ---
    // If there is a due date, create an event in Google Calendar first!
    if (dueDate) {
      try {
        const calendar = await getCalendarClient(session.user.id);
        
        // We will make the event last for 1 hour from the chosen due date
        const startDate = new Date(dueDate);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); 

        const event = await calendar.events.insert({
          calendarId: "primary", // Uses the user's main calendar
          requestBody: {
            summary: `Task: ${title}`,
            description: "Automatically synced from TachoTasks",
            start: { dateTime: startDate.toISOString() },
            end: { dateTime: endDate.toISOString() },
          },
        });

        // Save the Google Event ID so we can update/delete it later
        googleEventId = event.data.id;
      } catch (calendarError) {
        console.error("Failed to sync to Google Calendar:", calendarError);
        // We log the error but don't stop the task from saving to our database
      }
    }
    // ---------------------------

    // Save the task to Neon Postgres
    const newTask = await prisma.task.create({
      data: {
        title,
        listId,
        userId: session.user.id,
        dueDate: dueDate ? new Date(dueDate) : null,
        googleEventId: googleEventId, // Links the DB task to the Calendar event!
      },
    });

    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}