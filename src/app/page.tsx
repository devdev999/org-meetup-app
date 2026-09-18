import { redirect } from "next/navigation";
import { currentMember } from "../web/session";

export default async function HomePage() {
  const member = await currentMember();
  redirect(member ? "/profile" : "/sign-in");
}
