import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { PrivacyContact } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Data Deletion | Face Attendance",
  description: "Instructions for requesting deletion of Face Attendance information.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion Instructions"
      description="Use these instructions to request deletion of information associated with Face Attendance or its WhatsApp integration."
    >
      <section>
        <h2>School-managed records</h2>
        <p>
          Contact the school or organization that created the record. Provide the student or account
          name, organization name, relationship to the person, and the phone number or email connected
          to the record. The organization must verify the requester&apos;s authority before deleting or
          disclosing student information.
        </p>
      </section>

      <section>
        <h2>Platform or Meta-related requests</h2>
        <p>
          Send a request to <PrivacyContact /> with the subject “Face Attendance Data Deletion
          Request.” Include the organization name, the WhatsApp number or account email involved, the
          categories of data to delete, and enough information to verify ownership or authorization.
          Do not send passwords, face photographs, access tokens, or government identity documents by
          ordinary email.
        </p>
      </section>

      <section>
        <h2>What happens next</h2>
        <ul>
          <li>We acknowledge the request and may ask the controlling organization to verify it.</li>
          <li>Active access is disabled where appropriate while the request is reviewed.</li>
          <li>Eligible account, student, face embedding, attendance, and messaging records are deleted or anonymized.</li>
          <li>A confirmation is provided after completion.</li>
        </ul>
        <p>
          Limited security, transaction, or compliance records may be retained where required by law
          or necessary to establish that the request was completed. Backup copies expire through the
          normal protected backup lifecycle.
        </p>
      </section>

      <section>
        <h2>Removing WhatsApp access</h2>
        <p>
          You may also block the business number in WhatsApp and ask the school to remove your parent
          contact from future notifications. Removing or blocking WhatsApp does not automatically
          delete school attendance records; use the request process above for those records.
        </p>
      </section>
    </LegalPage>
  );
}
