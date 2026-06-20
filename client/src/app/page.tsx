"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Activity, 
  ChevronDown, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  BarChart3, 
  BrainCircuit, 
  CheckCircle,
  HelpCircle
} from "lucide-react";
import { HeroGeometric } from "@/components/ui/shape-landing-hero";

export default function LandingPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-[#030303] text-slate-100 font-sans selection:bg-[#13C296] selection:text-white antialiased">
      
      {/* Top Navbar */}
      <nav className="absolute top-0 left-0 w-full z-50 bg-transparent px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-[#13C296] to-emerald-400 flex items-center justify-center font-bold text-lg text-white shadow-md shadow-[#13C296]/20">
            E
          </div>
          <span className="font-bold text-xl tracking-tight text-white">
            EventFlow <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#13C296]/15 text-[#13C296] border border-[#13C296]/30">Fintech API</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-400">
          <a href="#features" className="hover:text-[#13C296] transition-colors">Features</a>
          <a href="#pricing" className="hover:text-[#13C296] transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-[#13C296] transition-colors">FAQ</a>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            href="/admin" 
            className="px-4 py-2 rounded-lg text-xs font-bold border border-white/10 text-slate-300 hover:bg-white/5 transition-all flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#13C296]" /> Admin Side
          </Link>
          <Link 
            href="/dashboard" 
            className="px-5 py-2 rounded-lg text-xs font-bold bg-[#13C296] text-white hover:bg-[#11aa83] transition-all shadow-md shadow-[#13C296]/20 flex items-center gap-1"
          >
            User Dashboard <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <HeroGeometric 
        badge="EventFlow Analytics"
        title1="Real-time Ingestion for"
        title2="Fintech Platforms"
      >
        <div className="flex flex-wrap justify-center gap-4 pt-2">
          <Link 
            href="/dashboard" 
            className="px-8 py-3 rounded-lg text-sm font-bold bg-[#13C296] text-white hover:bg-[#11aa83] transition-all shadow-lg shadow-[#13C296]/30 flex items-center gap-1.5"
          >
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
          <a 
            href="#features" 
            className="px-8 py-3 rounded-lg text-sm font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 transition-all"
          >
            Learn More
          </a>
        </div>
      </HeroGeometric>

      {/* Statistics Section */}
      <section className="bg-[#080808] py-16 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="space-y-1">
            <div className="text-4xl font-extrabold text-white">550+</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mock Events Tracked</div>
          </div>
          <div className="space-y-1">
            <div className="text-4xl font-extrabold text-white">100%</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dockerized Infrastructure</div>
          </div>
          <div className="space-y-1">
            <div className="text-4xl font-extrabold text-white">&lt; 150ms</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">GZIP Compressed Response API</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 max-w-7xl mx-auto px-6 text-center space-y-12">
        <div className="space-y-3">
          <span className="text-[#13C296] text-xs font-extrabold uppercase tracking-wider">Key Features</span>
          <h2 className="text-3xl md:text-4xl font-black text-white">All-in-one Financial Telemetry</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">Get complete visibility into customer pathways, conversions, and transactions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-[#0b0b0b] p-8 rounded-2xl border border-white/5 text-left space-y-4 hover:border-white/10 hover:shadow-2xl transition-all">
            <div className="p-3 rounded-lg bg-[#13C296]/10 text-[#13C296] w-fit">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">Instant Ingestion</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dispatch event logs dynamically via our Javascript SDK directly to the Kafka broker. Fast, low-latency queues.
            </p>
          </div>

          <div className="bg-[#0b0b0b] p-8 rounded-2xl border border-white/5 text-left space-y-4 hover:border-white/10 hover:shadow-2xl transition-all">
            <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400 w-fit">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">Mixpanel-style Cohorts</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create dynamic segmentation graphs, group events by client browser/device type, and filter cohort traits instantly.
            </p>
          </div>

          <div className="bg-[#0b0b0b] p-8 rounded-2xl border border-white/5 text-left space-y-4 hover:border-white/10 hover:shadow-2xl transition-all">
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400 w-fit">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">AI Reports</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generate weekly analytical narratives using OpenRouter LLMs. Connects with Google Docs to generate polished report drafts.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards Section */}
      <section id="pricing" className="py-24 bg-[#080808] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-12">
          <div className="space-y-3">
            <span className="text-[#13C296] text-xs font-extrabold uppercase tracking-wider">Flexible Pricing</span>
            <h2 className="text-3xl md:text-4xl font-black text-white">Choose Your Analytical Plan</h2>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">Scale your ingestion volume as your transactions grow.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="bg-[#0c0c0c] p-8 rounded-2xl border border-white/5 text-left flex flex-col justify-between hover:border-white/10 transition-all">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg text-white">Free Ingestion</h3>
                  <p className="text-[11px] text-slate-500">Perfect for prototyping fintech ideas</p>
                </div>
                <div className="text-3xl font-black text-white">$0 <span className="text-xs text-slate-500">/mo</span></div>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Up to 50k events/month</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> 1 Project Context</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Basic cohort filter</li>
                </ul>
              </div>
              <Link href="/dashboard" className="mt-6 w-full text-center py-2.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all block">
                Get Started
              </Link>
            </div>

            {/* Growth Plan */}
            <div className="bg-[#0e0e0e] text-white p-8 rounded-2xl text-left flex flex-col justify-between shadow-xl relative overflow-hidden border border-[#13C296]/30">
              <span className="absolute top-0 right-0 bg-[#13C296] text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">POPULAR</span>
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg text-white">Growth Core</h3>
                  <p className="text-[11px] text-slate-400">For scaling platforms</p>
                </div>
                <div className="text-3xl font-black text-white">$49 <span className="text-xs text-slate-400">/mo</span></div>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Up to 5M events/month</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Unlimited Project Contexts</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Full Mixpanel-style Insights</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Weekly AI Narrative reports</li>
                </ul>
              </div>
              <Link href="/dashboard" className="mt-6 w-full text-center py-2.5 rounded-lg text-xs font-bold bg-[#13C296] text-white hover:bg-[#11aa83] transition-all block">
                Upgrade Now
              </Link>
            </div>

            {/* Enterprise Plan */}
            <div className="bg-[#0c0c0c] p-8 rounded-2xl border border-white/5 text-left flex flex-col justify-between hover:border-white/10 transition-all">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg text-white">Enterprise</h3>
                  <p className="text-[11px] text-slate-500">For banks and regulated fintechs</p>
                </div>
                <div className="text-3xl font-black text-white">Custom</div>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Dedicated Kafka cluster partitions</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Local dockerized DB deployments</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#13C296]" /> Custom service accounts for Sheets</li>
                </ul>
              </div>
              <a href="mailto:support@eventflow.io" className="mt-6 w-full text-center py-2.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all block">
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 max-w-4xl mx-auto px-6 space-y-12">
        <div className="space-y-3 text-center">
          <span className="text-[#13C296] text-xs font-extrabold uppercase tracking-wider">Frequently Asked Questions</span>
          <h2 className="text-3xl font-black text-white">Got Questions? We Have Answers</h2>
        </div>

        <div className="space-y-4">
          {[
            {
              q: "How does the live ingestion system authenticate events?",
              a: "Events are authenticated directly at the Gateway using the 'X-API-Key' header. Once validated, they are pushed directly into a Kafka partition queue to ensure durability before database insertion."
            },
            {
              q: "Can I filter analytics metrics by dynamic properties?",
              a: "Yes! In the Mixpanel Insights tab, you can select custom breakdown properties and search values. EventFlow dynamically inspects the event's nested properties JSON map to group and isolate user cohorts."
            },
            {
              q: "Where can I manage system API keys?",
              a: "Administrative actions, such as viewing all users, projects, and revoking active API keys instantly, can be performed inside the Admin Control panel accessible at the top navbar."
            }
          ].map((item, idx) => (
            <div key={idx} className="bg-[#0c0c0c] rounded-xl border border-white/5 overflow-hidden shadow-sm hover:border-white/10 transition-all">
              <button 
                onClick={() => toggleFaq(idx)}
                className="w-full px-6 py-4 flex items-center justify-between text-left font-bold text-sm text-white hover:bg-white/5 transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-[#13C296]" /> {item.q}
                </span>
                <ChevronDown className={`w-4 h-4 text-[#13C296] transition-transform duration-350 ${activeFaq === idx ? "rotate-180" : ""}`} />
              </button>
              {activeFaq === idx && (
                <div className="px-6 pb-4 pt-1 text-xs text-slate-400 leading-relaxed border-t border-white/5">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#030303] py-12 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div>© {new Date().getFullYear()} EventFlow Inc. All rights reserved. Built with Next.js, Spring Boot & Tailwind.</div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
