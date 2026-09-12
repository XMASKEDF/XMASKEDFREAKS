import MaintenanceExperience from "@/components/MaintenanceExperience";
import { getMaintenanceSettings } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export default async function KillSwitchPage() {
  const settings = await getMaintenanceSettings();
  return <MaintenanceExperience settings={settings} />;
}
