"use client";

import { useState } from "react";
import { CallbackModal } from "./CallbackModal";
import { SITE } from "@/lib/constants";

interface ReportCTAProps {
  reportId: string;
  phone: string;
}

export function ReportCTA({ reportId, phone }: ReportCTAProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="mt-12 text-center" data-reveal data-report-cta>
        <h2 className="mb-3 text-xl font-bold text-charcoal">
          Want someone to fix this for you?
        </h2>
        <p className="mb-6 text-[0.95rem] text-slate">
          Daniel can walk you through your report and show you what your site
          could look like with these changes applied. Book a free 15-minute
          report review call — no obligation, no pressure.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
        >
          Request a Free Report Review Call
        </button>
        <p className="mt-6 text-xs text-muted">
          Or call Daniel directly —{" "}
          <a
            href={SITE.phoneTel}
            className="font-semibold text-teal transition-colors hover:text-teal-deep"
          >
            {SITE.phone}
          </a>
        </p>
        <p className="mt-1 text-xs text-muted">
          <a
            href={`mailto:${SITE.email}?subject=My Signal Score report`}
            className="font-semibold text-teal transition-colors hover:text-teal-deep"
          >
            Email Daniel
          </a>
        </p>
      </div>

      {showModal && (
        <CallbackModal
          reportId={reportId}
          phone={phone}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
