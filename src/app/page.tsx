import { redirect } from "next/navigation";

/** Home is the Dashboard; the Agents list lives at /agents. */
export default function Home() {
  redirect("/dashboard");
}
