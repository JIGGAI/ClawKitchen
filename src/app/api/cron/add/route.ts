import { NextResponse } from "next/server";
import { createCronJob, type CronJobData } from "@/lib/cron-job-utils";

export async function POST(req: Request) {
  try {
    const body = await req.json() as CronJobData;
    const result = await createCronJob(body);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Error creating cron job:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}