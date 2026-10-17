import { redirect } from "next/navigation";

// "Ready to list" became Inventory > Drafted
export default function ReadyPage() {
  redirect("/unlisted?stage=drafted");
}
