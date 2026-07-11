import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WELCOME_COOKIE } from "@/lib/welcome";

export default async function Home() {
  const cookieStore = await cookies();
  const hasOnboarded = cookieStore.get(WELCOME_COOKIE)?.value === "1";
  redirect(hasOnboarded ? "/studies" : "/welcome");
}
