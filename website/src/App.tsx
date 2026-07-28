const APP_URL = 'https://portal.caremid.co.uk';   // managers & admins
const CARER_URL = 'https://carer.caremid.co.uk';  // carers & staff doing visits
const CONTACT_EMAIL = 'hello@caremid.co.uk';

const features = [
  {
    icon: '🗓️',
    title: 'Smart rota scheduling',
    body: 'Build and publish carer rotas in minutes. Drag-and-drop visits, spot clashes, and keep everyone on the same page in real time.',
  },
  {
    icon: '📋',
    title: 'Digital care planning',
    body: 'Person-centred care plans, risk assessments and daily notes — all in one secure record your team can access on the move.',
  },
  {
    icon: '💊',
    title: 'eMAR & medication',
    body: 'Electronic medication administration records reduce missed doses and give you a clear audit trail for CQC inspections.',
  },
  {
    icon: '📱',
    title: 'Carer mobile app',
    body: 'Your care workers see their schedule, check in and out of visits, and log notes and tasks straight from their phone.',
  },
  {
    icon: '💷',
    title: 'Funder invoicing',
    body: 'Bill councils, NHS and private clients automatically from scheduled hours. Export polished PDF and CSV invoices in a click.',
  },
  {
    icon: '👪',
    title: 'Family portal',
    body: 'Give families reassuring, secure visibility of visits and updates for their loved ones — building trust and cutting phone calls.',
  },
];

const steps = [
  { n: '1', title: 'Add your team & clients', body: 'Set up carers, service users and funders in a guided onboarding.' },
  { n: '2', title: 'Build your rota', body: 'Schedule visits and publish to your carers’ phones instantly.' },
  { n: '3', title: 'Deliver & record care', body: 'Carers check in, follow care plans and log eMAR on the go.' },
  { n: '4', title: 'Invoice & report', body: 'Generate funder invoices from delivered hours and stay CQC-ready.' },
];

function Nav() {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-100">
      <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2 font-bold text-xl text-brand-700">
          <img src="/icon-192.png" alt="Caremid" className="w-8 h-8 rounded-lg bg-white object-contain" />
          Caremid
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#features" className="hover:text-brand-700">Features</a>
          <a href="#how" className="hover:text-brand-700">How it works</a>
          <a href="#pricing" className="hover:text-brand-700">Pricing</a>
          <a href="#contact" className="hover:text-brand-700">Contact</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href={CARER_URL} className="hidden sm:inline text-sm font-semibold text-slate-700 hover:text-brand-700">
            Carer login
          </a>
          <a href={APP_URL} className="hidden sm:inline text-sm font-semibold text-slate-700 hover:text-brand-700">
            Manager login
          </a>
          <a
            href="#contact"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Book a demo
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28 text-center">
        <span className="inline-block rounded-full bg-brand-100 text-brand-700 text-xs font-semibold px-3 py-1 mb-6">
          Built for UK domiciliary & residential care
        </span>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 max-w-3xl mx-auto">
          Run your care business from one calm, connected place
        </h1>
        <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
          Caremid brings scheduling, care planning, eMAR, invoicing and family updates together —
          so your team spends less time on admin and more time on care.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="#contact"
            className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white hover:bg-brand-700 shadow-sm"
          >
            Book a free demo
          </a>
          <a
            href={APP_URL}
            className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-slate-700 border border-slate-200 hover:border-brand-300"
          >
            Manager login
          </a>
          <a
            href={CARER_URL}
            className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-slate-700 border border-slate-200 hover:border-brand-300"
          >
            Carer login
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-500">CQC-ready records · GDPR compliant · Data hosted in the EU</p>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Everything your care service needs</h2>
        <p className="mt-4 text-slate-600">
          One system replaces the spreadsheets, paper MAR charts and WhatsApp groups.
        </p>
      </div>
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm hover:shadow-md transition">
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-2 text-slate-600 text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="bg-slate-50 border-y border-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Up and running in a day</h2>
          <p className="mt-4 text-slate-600">A simple path from sign-up to your first invoice.</p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white p-7 border border-slate-100">
              <div className="grid place-items-center w-10 h-10 rounded-full bg-brand-600 text-white font-bold">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Simple, fair pricing</h2>
        <p className="mt-4 text-slate-600">
          Pay for the size of your service, not per feature. Every plan includes the full platform.
        </p>
      </div>
      <div className="mt-14 grid gap-6 lg:grid-cols-3 items-stretch">
        <PriceCard
          name="Starter"
          price="£99"
          note="/ month"
          blurb="For new and small services finding their feet."
          points={['Up to 15 carers', 'Scheduling & care planning', 'Carer mobile app', 'Email support']}
        />
        <PriceCard
          name="Growth"
          price="£249"
          note="/ month"
          blurb="For growing services that invoice funders."
          highlighted
          points={[
            'Up to 50 carers',
            'Everything in Starter',
            'eMAR & funder invoicing',
            'Family portal',
            'Priority support',
          ]}
        />
        <PriceCard
          name="Enterprise"
          price="Let’s talk"
          note=""
          blurb="For multi-branch and larger providers."
          points={['Unlimited carers', 'Everything in Growth', 'Multiple branches', 'Onboarding & training', 'Dedicated account manager']}
        />
      </div>
      <p className="mt-8 text-center text-sm text-slate-500">
        Prices exclude VAT. Final pricing confirmed after your demo.
      </p>
    </section>
  );
}

function PriceCard({
  name,
  price,
  note,
  blurb,
  points,
  highlighted,
}: {
  name: string;
  price: string;
  note: string;
  blurb: string;
  points: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-8 flex flex-col ${
        highlighted ? 'bg-brand-600 text-white shadow-lg ring-4 ring-brand-100' : 'bg-white border border-slate-100'
      }`}
    >
      {highlighted && (
        <span className="self-start rounded-full bg-white/20 text-xs font-semibold px-3 py-1 mb-3">Most popular</span>
      )}
      <h3 className={`text-lg font-semibold ${highlighted ? 'text-white' : 'text-slate-900'}`}>{name}</h3>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-4xl font-extrabold">{price}</span>
        {note && <span className={`mb-1 text-sm ${highlighted ? 'text-brand-100' : 'text-slate-500'}`}>{note}</span>}
      </div>
      <p className={`mt-3 text-sm ${highlighted ? 'text-brand-100' : 'text-slate-600'}`}>{blurb}</p>
      <ul className="mt-6 space-y-3 text-sm flex-1">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className={highlighted ? 'text-white' : 'text-brand-600'}>✓</span>
            <span className={highlighted ? 'text-white' : 'text-slate-700'}>{p}</span>
          </li>
        ))}
      </ul>
      <a
        href="#contact"
        className={`mt-8 rounded-lg px-5 py-3 text-center text-sm font-semibold ${
          highlighted ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-brand-600 text-white hover:bg-brand-700'
        }`}
      >
        Book a demo
      </a>
    </div>
  );
}

function Contact() {
  return (
    <section id="contact" className="bg-brand-900">
      <div className="mx-auto max-w-4xl px-5 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white">See Caremid in action</h2>
        <p className="mt-4 text-brand-100 max-w-xl mx-auto">
          Book a free, no-obligation demo and we’ll show you how Caremid fits your service.
          We’ll get back to you within one working day.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Caremid%20demo%20request`}
            className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-brand-700 hover:bg-brand-50"
          >
            Email {CONTACT_EMAIL}
          </a>
          <a
            href={APP_URL}
            className="rounded-lg border border-white/30 px-6 py-3 text-base font-semibold text-white hover:bg-white/10"
          >
            Log in
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400">
      <div className="mx-auto max-w-6xl px-5 py-12 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 font-bold text-lg text-white">
            <img src="/icon-192.png" alt="Caremid" className="w-7 h-7 rounded-lg bg-white object-contain" />
            Caremid
          </div>
          <p className="mt-2 text-sm">Care management software for UK care providers.</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#pricing" className="hover:text-white">Pricing</a>
          <a href={APP_URL} className="hover:text-white">Manager login</a>
          <a href={CARER_URL} className="hover:text-white">Carer login</a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">Contact</a>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="mx-auto max-w-6xl px-5 py-5 text-xs text-slate-500">
          © {new Date().getFullYear()} Caremid. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-800 antialiased">
      <Nav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
