import { NextResponse } from "next/server";
import { updateCronJob, type CronJobData } from "@/lib/cron-job-utils";

export async function POST(req: Request) {
  try {
    const body = await req.json() as CronJobData & { id: string };
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }
    
    const { id, ...cronJobData } = body;
    const result = await updateCronJob(id, cronJobData);
    
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Error updating cron job:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}