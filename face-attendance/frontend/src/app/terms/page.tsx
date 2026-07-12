import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { PrivacyContact } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service | Face Attendance",
  description: "Terms governing authorized use of the Face Attendance platform.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="These terms govern access to and use of the Face Attendance school attendance platform."
    >
      <section>
        <h2>Authorized use</h2>
        <p>
          The platform may be used only by organizations and users authorized to manage the relevant
          school, staff, student, attendance, biometric, and parent-contact information. Users must
          keep credentials secure and comply with assigned roles and tenant boundaries.
        </p>
      </section>

      <section>
        <h2>Organization responsibilities</h2>
        <ul>
          <li>Provide accurate records and keep access permissions current.</li>
          <li>Obtain all notices, consents, and permissions required for student and biometric data.</li>
          <li>Use WhatsApp messaging only for lawful, expected school communications.</li>
          <li>Configure retention, respond to data-subject requests, and remove access promptly.</li>
          <li>Do not use the service for covert surveillance or unrelated identification.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          Users must not bypass security, access another organization&apos;s records, upload unlawful or
          malicious content, abuse messaging services, reverse engineer protected service components,
          or use the platform in a way that violates law or third-party rights.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          Face recognition and external messaging depend on network access and third-party services.
          Organizations must maintain a reasonable manual attendance fallback. The service may be
          changed, suspended, or limited for maintenance, security, abuse prevention, or legal reasons.
        </p>
      </section>

      <section>
        <h2>Privacy and third-party services</h2>
        <p>
          Personal information is handled as described in the Privacy Policy. Use of Meta WhatsApp
          and other infrastructure providers may also be governed by their applicable terms and
          policies.
        </p>
      </section>

      <section>
        <h2>Disclaimers and responsibility</h2>
        <p>
          Face recognition can produce false matches or missed matches and must not be treated as the
          sole evidence in disciplinary, safety, or legal decisions. Authorized staff remain
          responsible for reviewing attendance records and correcting errors.
        </p>
      </section>

      <section>
        <h2>Termination and deletion</h2>
        <p>
          Access may be suspended for misuse or security risk. When service ends, the organization
          should export required records and request deletion according to the Data Deletion page,
          subject to lawful retention obligations.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about these terms can be sent to <PrivacyContact />.</p>
      </section>
    </LegalPage>
  );
}
