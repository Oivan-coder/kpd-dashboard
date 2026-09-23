import { getDashboardData } from "@/lib/google-sheets";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const data = await getDashboardData();
  return <Dashboard data={data} />;
}
