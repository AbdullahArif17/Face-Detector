import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { PrivacyContact } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | Face Attendance",
  description: "Privacy practices for the Face Attendance school attendance platform.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This policy explains how Face Attendance processes information for schools, their authorized staff, students, and parents or guardians."
    >
      <section>
        <h2>Who controls the data</h2>
        <p>
          The school or organization using Face Attendance controls its student and attendance
          records. Face Attendance processes that information to provide the service under the
          organization&apos;s instructions. The organization is responsible for providing required
          notices and obtaining appropriate authorization or guardian consent.
        </p>
      </section>

      <section>
        <h2>Information we process</h2>
        <ul>
          <li>Organization, branch, class, staff-account, and access-role information.</li>
          <li>Student names, roll numbers, classes, status, and profile photographs.</li>
          <li>Parent or guardian names, phone numbers, and WhatsApp delivery information.</li>
          <li>Attendance events, check-in and check-out times, confidence scores, and audit logs.</li>
          <li>Face images submitted for enrollment or recognition and derived biometric embeddings.</li>
          <li>WhatsApp messages, message identifiers, delivery statuses, and inbound chatbot commands.</li>
          <li>Basic security and diagnostic information needed to operate and protect the service.</li>
        </ul>
      </section>

      <section>
        <h2>How information is used</h2>
        <p>
          Information is used to authenticate authorized users, maintain school records, enroll and
          recognize faces for attendance, run class attendance sessions, notify parents or guardians,
          answer attendance-status requests, prevent misuse, troubleshoot failures, and comply with
          lawful obligations. We do not sell personal or biometric information.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosures</h2>
        <p>
          The service uses infrastructure providers including Vercel for application hosting, Neon
          for database hosting, Hugging Face for isolated face-recognition processing, and Meta&apos;s
          WhatsApp Business Platform for messages. Information is shared only as needed to provide
          those functions, protect the service, comply with law, or follow the controlling
          organization&apos;s authorized instructions.
        </p>
      </section>

      <section>
        <h2>Biometric and children&apos;s information</h2>
        <p>
          Face recognition must only be enabled by an authorized school after it has established a
          lawful basis and obtained any required parent or guardian consent. Derived face embeddings
          are encrypted when stored in production. Face processing is limited to enrollment and
          attendance matching and is not used for advertising or unrelated profiling.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          Records are retained only for the operational, contractual, security, and legal periods
          established by the controlling organization. We use tenant isolation, access controls,
          encrypted transport, encrypted biometric storage, signed webhooks, and restricted service
          credentials. No system can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Your choices and deletion</h2>
        <p>
          Parents, guardians, students where legally applicable, and staff should first contact their
          school or organization to access, correct, deactivate, or delete a record. Platform-level
          requests can be submitted using the process on the Data Deletion page. We may request
          verification before acting and may retain limited records where legally required.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For privacy questions or unresolved deletion requests, contact <PrivacyContact />.
        </p>
      </section>

      <section>
        <h2>Policy changes</h2>
        <p>
          This policy may be updated when the service or legal requirements change. The effective
          date above will be revised when material changes are published.
        </p>
      </section>
    </LegalPage>
  );
}
