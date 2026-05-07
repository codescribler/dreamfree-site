import { SectionNav } from "./SectionNav";

export default function EmailCampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <SectionNav />
      {children}
    </div>
  );
}
