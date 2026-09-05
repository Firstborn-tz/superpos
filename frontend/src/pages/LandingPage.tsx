import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PublicBranch } from '@/types'
import { pullPublicBranches } from '@/services/firebase/firestoreService'
import { BUSINESS_INFO, getDirectionsUrl, getGoogleReviewUrl, getWhatsAppUrl } from '@/config/businessInfo'
import Reveal from '@/components/landing/Reveal'
import {
  BoxIcon,
  LeafIcon,
  TruckIcon,
  ShieldIcon,
  MapPinIcon,
  ClockIcon,
  PhoneIcon,
  StarIcon,
  DollarIcon,
  CheckIcon,
  RefundIcon,
  CartIcon,
  WhatsAppIcon,
  ChevronRightIcon,
} from '@/components/common/Icons'

const SERVICES = [
  { icon: LeafIcon, title: 'Fresh Produce', desc: 'Daily-sourced fruits and vegetables, always fresh on our shelves.' },
  { icon: CartIcon, title: 'Everything in One Cart', desc: 'Everything from cleaning supplies to kitchenware, all in one place.' },
  { icon: DollarIcon, title: 'Fair, Honest Prices', desc: 'Transparent pricing with regular deals across every department.' },
  { icon: TruckIcon, title: 'Well-Stocked Shelves', desc: 'Real-time stock tracking across branches means fewer "out of stock" surprises.' },
  { icon: ShieldIcon, title: 'Quality You Can Trust', desc: 'Every product checked for freshness and quality before it reaches the shelf.' },
  { icon: RefundIcon, title: 'Easy Returns', desc: "Not quite right? We'll sort it out quickly, no hassle." },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [branches, setBranches] = useState<PublicBranch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(true)

  useEffect(() => {
    let cancelled = false
    pullPublicBranches()
      .then((b) => {
        if (!cancelled) setBranches(b)
      })
      .catch((err) => console.error('Failed to load branches for landing page', err))
      .finally(() => {
        if (!cancelled) setLoadingBranches(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-app-card overflow-x-hidden">
      {/* ---------------------------------------------------------- */}
      {/* Nav */}
      {/* ---------------------------------------------------------- */}
      <header className="sticky top-0 z-30 bg-app-card/90 backdrop-blur border-b border-app-border">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
              <CartIcon width={20} height={20} />
            </div>
            <span>
              <span className="block font-extrabold leading-tight text-app-heading">Sengasu</span>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-primary font-bold">Mini Supermarket</span>
            </span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Staff Login
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------- */}
      <section className="relative bg-gradient-to-br from-primary via-primary to-primary-dark text-white overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-32 -left-16 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <LeafIcon
          width={40}
          height={40}
          className="absolute top-24 left-[8%] text-white/20 hidden sm:block animate-[float_6s_ease-in-out_infinite]"
        />
        <BoxIcon
          width={48}
          height={48}
          className="absolute bottom-24 right-[10%] text-white/20 hidden sm:block animate-[float_7s_ease-in-out_infinite]"
          style={{ animationDelay: '1.5s' }}
        />
        <StarIcon
          width={28}
          height={28}
          className="absolute top-40 right-[20%] text-white/20 hidden sm:block animate-[float_5s_ease-in-out_infinite]"
          style={{ animationDelay: '0.5s' }}
        />

        <div className="relative max-w-6xl mx-auto px-5 py-20 md:py-28 grid lg:grid-cols-[1.1fr_.9fr] gap-12 items-center">
          <div className="lg:text-left text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 text-sm font-semibold mb-6 animate-[fadeInUp_0.8s_ease]">
              <span className="w-2 h-2 rounded-full bg-lime-200 animate-pulse" /> Serving the community, every day
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-[1.08] mb-5 animate-[fadeInUp_0.8s_ease_0.1s_backwards]">
              Good things for <span className="text-lime-200">every cart.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 max-w-xl lg:mx-0 mx-auto mb-8 animate-[fadeInUp_0.8s_ease_0.2s_backwards]">
              {BUSINESS_INFO.tagline} Everyday shopping made simple, fresh and friendly.
            </p>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 animate-[fadeInUp_0.8s_ease_0.3s_backwards]">
              <a href="#branches" className="inline-flex items-center gap-2 bg-white text-primary-dark font-bold px-5 py-3.5 rounded-xl hover:bg-lime-50 transition-colors shadow-lg shadow-black/10">
                <MapPinIcon width={18} height={18} /> Find a branch <ChevronRightIcon width={16} height={16} />
              </a>
              <a href={getWhatsAppUrl(`Hello ${BUSINESS_INFO.name}, I have a question.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 font-bold px-5 py-3.5 rounded-xl transition-colors">
                <WhatsAppIcon width={19} height={19} /> WhatsApp us
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 justify-center lg:justify-start text-sm text-white/85">
              {['Fresh produce', 'Household essentials', 'Helpful service'].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><CheckIcon width={15} height={15} className="text-lime-200" />{item}</span>)}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md animate-[fadeInUp_0.8s_ease_0.2s_backwards]">
            <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl bg-emerald-950/20" />
            <div className="relative rounded-3xl bg-white p-6 text-app-heading shadow-2xl shadow-emerald-950/20">
              <div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.16em] font-bold text-primary">Your Sengasu basket</p><h2 className="mt-1 text-2xl font-extrabold">Shopping feels easy here.</h2></div><span className="w-12 h-12 grid place-items-center rounded-2xl bg-primary-50 text-primary"><CartIcon width={24} height={24} /></span></div>
              <div className="mt-6 space-y-3">{[['Fresh foods', 'Picked with care'], ['Home essentials', 'Ready for your routine'], ['Friendly team', 'Here to help']].map(([title, detail], index) => <div key={title} className="flex items-center gap-3 rounded-2xl bg-app-alt px-3.5 py-3"><span className="w-8 h-8 rounded-full bg-primary text-white grid place-items-center text-xs font-black">0{index + 1}</span><span><b className="block text-sm">{title}</b><span className="block text-xs text-app-muted">{detail}</span></span><CheckIcon width={17} height={17} className="ml-auto text-primary" /></div>)}</div>
              <a href={getGoogleReviewUrl()} target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100 transition-colors"><span className="flex items-center gap-1.5 font-semibold"><StarIcon width={17} height={17} className="fill-warning text-warning" />Enjoyed your visit?</span><b>Review us</b></a>
            </div>
          </div>
        </div>

        <svg viewBox="0 0 1440 60" className="relative block w-full text-app-card" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,32L80,26.7C160,21,320,11,480,16C640,21,800,43,960,48C1120,53,1280,43,1360,37.3L1440,32L1440,60L0,60Z" />
        </svg>
      </section>

      <section className="relative z-10 -mt-7 max-w-6xl mx-auto px-5">
        <div className="grid sm:grid-cols-3 rounded-2xl overflow-hidden bg-app-card border border-app-border shadow-card">
          <div className="p-4 flex items-center gap-3 sm:justify-center border-b sm:border-b-0 sm:border-r border-app-border"><LeafIcon className="text-primary" /><span><b className="block text-sm text-app-heading">Fresh choices</b><span className="text-xs text-app-muted">For every home</span></span></div>
          <div className="p-4 flex items-center gap-3 sm:justify-center border-b sm:border-b-0 sm:border-r border-app-border"><ClockIcon className="text-primary" /><span><b className="block text-sm text-app-heading">Open every day</b><span className="text-xs text-app-muted">{BUSINESS_INFO.openingHours}</span></span></div>
          <div className="p-4 flex items-center gap-3 sm:justify-center"><WhatsAppIcon className="text-primary" /><span><b className="block text-sm text-app-heading">Need help?</b><span className="text-xs text-app-muted">Chat with our team</span></span></div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Services */}
      {/* ---------------------------------------------------------- */}
      <section className="max-w-6xl mx-auto px-5 py-20">
        <Reveal className="text-center mb-12">
          <span className="text-sm uppercase tracking-[0.16em] font-bold text-primary">Made for daily life</span>
          <h2 className="text-3xl font-extrabold text-app-heading mt-3 mb-3">More than a supermarket stop.</h2>
          <p className="text-app-muted max-w-xl mx-auto">
            Everything your household needs, bites, stocked fresh and priced fairly.
          </p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <div className="group bg-app-card border border-app-border rounded-card p-6 h-full hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <s.icon width={22} height={22} />
                </div>
                <h3 className="font-bold text-app-heading mb-1.5">{s.title}</h3>
                <p className="text-sm text-app-muted">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Branch locations - pulled live from Firestore */}
      {/* ---------------------------------------------------------- */}
      <section id="branches" className="bg-app-alt py-20">
        <div className="max-w-6xl mx-auto px-5">
          <Reveal className="text-center mb-12">
          <span className="text-sm uppercase tracking-[0.16em] font-bold text-primary">Come say hello</span>
          <h2 className="text-3xl font-extrabold text-app-heading mt-3 mb-3">Find your nearest Sengasu.</h2>
            <p className="text-app-muted flex items-center justify-center gap-2">
              <ClockIcon width={16} height={16} />
              {BUSINESS_INFO.openingHours}
            </p>
          </Reveal>

          {loadingBranches ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-app-card rounded-card p-6 h-40 animate-pulse" />
              ))}
            </div>
          ) : branches.length === 0 ? (
            <p className="text-center text-app-faint">Branch details will appear here soon.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {branches.map((b, i) => (
                <Reveal key={b.id} delay={i * 80}>
                  <div className="bg-app-card border border-app-border rounded-card p-6 h-full">
                    <div className="w-11 h-11 rounded-lg bg-primary-50 text-primary flex items-center justify-center mb-3">
                      <MapPinIcon width={20} height={20} />
                    </div>
                    <h3 className="font-bold text-app-heading mb-1">{b.name}</h3>
                    <p className="text-sm text-app-muted mb-1">{b.address}</p>
                    <p className="text-sm text-app-muted mb-4 flex items-center gap-1.5">
                      <PhoneIcon width={13} height={13} />
                      {b.phone}
                    </p>
                    <a
                      href={getDirectionsUrl(b.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Get directions &rarr;
                    </a>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Footer */}
      {/* ---------------------------------------------------------- */}
      <footer className="bg-gray-900 text-white/70 py-10">
        <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <div className="font-bold text-white">{BUSINESS_INFO.name}</div>
            <div className="text-sm mt-1">
              {BUSINESS_INFO.phone} &middot; {BUSINESS_INFO.email}
            </div>
          </div>
          <div className="text-sm text-center md:text-right">
            <div>
              &copy; {new Date().getFullYear()} {BUSINESS_INFO.name}. All rights reserved.
            </div>
            <div className="mt-1">Developed by Progr_Willy</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
