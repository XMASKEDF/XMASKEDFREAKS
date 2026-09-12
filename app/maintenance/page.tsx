import MaintenanceExperience from "@/components/MaintenanceExperience";
import { getMaintenanceSettings } from "@/lib/maintenance";

export default async function MaintenancePage() {
  const settings = await getMaintenanceSettings();
  return <MaintenanceExperience settings={settings} />;
}
