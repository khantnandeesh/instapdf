import { cloudPrepaintScript } from "@/lib/cloud/last-used";
import { configuredProviders } from "@/lib/cloud/providers";

/** F23 (U-12): marks <html data-cloud-last> before first paint, so the cloud row never shifts. Nothing when the feature is off. */
export function CloudPrepaintScript() {
  const providers = configuredProviders();
  if (!providers.length) return null;
  return <script dangerouslySetInnerHTML={{ __html: cloudPrepaintScript(providers) }} />;
}
