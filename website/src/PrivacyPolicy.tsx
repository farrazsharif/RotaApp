import type { ReactNode } from 'react';

// Privacy policy for the Caremid website, manager portal, carer app and family
// portal. Linked from the footer, and required by Apple and Google before the
// apps can be listed.
const CONTACT_EMAIL = 'hello@caremid.co.uk';
const UPDATED = '19 October 2026';


function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white text-slate-800 antialiased">
      <header className="border-b border-slate-200">
        <div className="mx-auto max-w-3xl px-5 py-5">
          <a href="/" className="flex items-center gap-2 font-bold text-lg text-slate-900 w-fit">
            <img src="/icon-192.png" alt="" className="w-7 h-7 rounded-lg object-contain" />
            Caremid
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {UPDATED}</p>

        <p className="mt-6 text-slate-700 leading-relaxed">
          Caremid provides care management software for UK care providers. This policy explains what
          personal information our website, manager portal, carer app and family portal handle, why,
          and what your rights are.
        </p>

        <Section title="Our role: controller and processor">
          <p>
            Most information in Caremid is entered by a care provider about the people they support
            and the staff they employ. For that information the <strong>care provider is the data
            controller</strong> and <strong>Caremid is a data processor</strong> acting on their
            instructions. If you receive care, or work for a care provider, and want to see, correct
            or delete your information, please contact that care provider directly. They decide how
            it is used, and we act on their instructions.
          </p>
          <p>
            Caremid is the <strong>controller</strong> for the limited information we hold in our own
            right: the account and billing details of care providers who subscribe to us, and
            enquiries sent to us through this website.
          </p>
        </Section>

        <Section title="What information the apps handle">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Staff:</strong> name, email address, phone number, role, employment and
              compliance records such as DBS details, training and supervisions, rota, clock in and
              out times, and recorded hours.
            </li>
            <li>
              <strong>People receiving care:</strong> name, address, date of birth, contact details,
              care and support plans, risk assessments, medication records (MAR), visit notes and
              support logs, incident and accident records, and, where the provider uses the feature,
              records of money handled on their behalf including photographs of receipts.
            </li>
            <li>
              <strong>Family members:</strong> name and email address, where a provider invites a
              relative to the family portal.
            </li>
            <li>
              <strong>Account and billing:</strong> the subscribing organisation&rsquo;s contact and
              subscription details.
            </li>
          </ul>
          <p>
            Care records include <strong>health information</strong>, a special category of personal
            data under UK GDPR. It is handled only to deliver and evidence care.
          </p>
        </Section>

        <Section title="What we do not do">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              We do <strong>not</strong> track your location. The carer app records the time a visit
              starts and ends, not where you are.
            </li>
            <li>
              We do <strong>not</strong> use advertising, advertising identifiers, or third-party
              analytics or tracking tools in the apps.
            </li>
            <li>We do <strong>not</strong> sell personal information, or share it for advertising.</li>
            <li>We do <strong>not</strong> use care records to train artificial intelligence models.</li>
          </ul>
        </Section>

        <Section title="Why we use it, and our legal basis">
          <p>
            As a processor, we handle care and staff records only to provide the service to the care
            provider, under our contract with them. Where we are the controller, we rely on:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Contract</strong> &mdash; to provide and bill for the service.</li>
            <li>
              <strong>Legitimate interests</strong> &mdash; to keep the service secure, prevent abuse,
              and respond to enquiries.
            </li>
            <li>
              <strong>Legal obligation</strong> &mdash; to keep records we are required to keep, such
              as for tax.
            </li>
          </ul>
        </Section>

        <Section title="Who else is involved">
          <p>
            We use a small number of suppliers to run the service. They act on our instructions and
            may not use the information for their own purposes:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Neon</strong> &mdash; database hosting</li>
            <li><strong>Render</strong> &mdash; application hosting</li>
            <li><strong>Vercel</strong> &mdash; hosting for the website and web apps</li>
            <li><strong>Cloudflare R2</strong> &mdash; storage for uploaded documents and receipt photographs</li>
            <li>
              <strong>Stripe</strong> &mdash; subscription payments from care providers. Stripe does
              not receive care records.
            </li>
            <li>
              <strong>Brevo</strong> &mdash; sending service emails such as invitations and
              password resets
            </li>
          </ul>
          <p>
            We may also disclose information where the law requires it, or to protect someone&rsquo;s
            vital interests in an emergency.
          </p>
        </Section>

        <Section title="Where information is stored">
          <p>
            Our application servers and database are hosted in the{' '}
            <strong>European Union (Frankfurt)</strong>. Uploaded files are stored with Cloudflare R2.
            Information may therefore be processed outside the United Kingdom. Where that happens we
            rely on UK adequacy regulations or appropriate safeguards such as standard contractual
            clauses.
          </p>
        </Section>

        <Section title="How long it is kept">
          <p>
            Care and staff records are kept while the care provider&rsquo;s account is active, and then
            in line with their instructions and their own retention obligations. Health and social care
            records are commonly kept for several years after care ends. When a provider ends their
            subscription we delete or return their data on request, subject to records we must keep by
            law. Backups are retained for a limited period and then overwritten.
          </p>
        </Section>

        <Section title="How it is protected">
          <p>
            All traffic is encrypted in transit using HTTPS. Access is restricted by role, so staff see
            only the people and information their role requires, and providers can restrict access
            further by location. Passwords are stored only as salted hashes, never in readable form.
            The database is backed up regularly, and access to production systems is limited to those
            who need it.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You have the right to ask for access to your personal information, and to ask for it to be
            corrected, deleted or restricted, to object to its use, and to receive a copy in a portable
            form. You also have the right to complain to the Information Commissioner&rsquo;s Office (
            <a className="text-brand-700 underline" href="https://ico.org.uk" target="_blank" rel="noreferrer">
              ico.org.uk
            </a>
            ).
          </p>
          <p>
            If your information is held by a care provider using Caremid, please contact that provider
            first, as they are the controller. If you contact us instead, we will pass your request on
            to them.
          </p>
        </Section>

        <Section title="Children&rsquo;s information">
          <p>
            The apps are used by care staff, who are adults. Where a care provider supports a young
            person, their records are handled on the same basis as any other person receiving care,
            under the provider&rsquo;s instructions.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We will update this page if our practices change, and will update the date at the top. If a
            change is significant we will tell subscribing providers directly.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Email{' '}
            <a className="text-brand-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p className="text-sm text-slate-500">
            Caremid is a product of <strong>800 Vision Limited</strong>, a company registered in
            England and Wales (company number 17343907). Registered office: 11a Lane End Road,
            Manchester, M19 1WA, United Kingdom.
          </p>
        </Section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-5 py-6 text-xs text-slate-500">
          <a href="/" className="hover:text-slate-800">&larr; Back to Caremid</a>
        </div>
      </footer>
    </div>
  );
}
