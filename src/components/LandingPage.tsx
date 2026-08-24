import React from 'react';
import { motion } from 'motion/react';
import { 
  Database, 
  Search, 
  Shield, 
  Zap, 
  ChevronRight, 
  Smartphone, 
  Globe, 
  Layers, 
  Cpu, 
  Lock,
  ArrowRight,
  ClipboardCheck,
  TrendingUp,
  History,
  Activity
} from 'lucide-react';

interface LandingPageProps {
  onLaunchApp: () => void;
  onToggleTheme: () => void;
  theme: string;
}

export default function LandingPage({ onLaunchApp, onToggleTheme, theme }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-bg text-text font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-black tracking-tighter text-xl uppercase">DT.Base</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-xs font-display font-bold uppercase tracking-widest text-muted hover:text-text transition-colors">Features</a>
            <a href="#tech" className="text-xs font-display font-bold uppercase tracking-widest text-muted hover:text-text transition-colors">Technology</a>
            <a href="#security" className="text-xs font-display font-bold uppercase tracking-widest text-muted hover:text-text transition-colors">Security</a>
          </div>

          <div className="flex items-center gap-4">
            <button 
              type="button"
              onClick={onLaunchApp}
              className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white font-display font-bold uppercase tracking-widest text-[10px] rounded-full transition-all shadow-lg shadow-violet-900/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Launch App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 bg-violet-600 rounded-full blur-[120px]" />
          <div className="absolute top-40 right-10 w-96 h-96 bg-cyan-600 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block px-4 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-[10px] font-display font-black uppercase tracking-[0.3em] mb-6">
              The Future of Digital Records
            </span>
            <h1 className="text-5xl md:text-8xl font-display font-black tracking-tighter uppercase text-white mb-8 leading-[0.9]">
              Track. Analyze.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Scale Effortlessly.</span>
            </h1>
            <p className="max-w-2xl mx-auto text-muted text-sm md:text-base leading-relaxed mb-10 uppercase tracking-widest font-medium opacity-80">
              DT.Base is a high-performance database management system designed for vehicle maintenance, asset tracking, and mission-critical data extraction.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                type="button"
                onClick={onLaunchApp}
                className="w-full sm:w-auto px-10 py-5 bg-white text-black font-display font-black uppercase tracking-[0.3em] text-xs rounded-2xl hover:bg-violet-400 hover:text-white transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                Go to Dashboard
                <ChevronRight className="w-4 h-4" />
              </button>
              <button 
                type="button"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full sm:w-auto px-10 py-5 bg-surface border border-border text-text font-display font-black uppercase tracking-[0.3em] text-xs rounded-2xl hover:bg-white/5 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                Learn More
              </button>
            </div>
          </motion.div>

          {/* App Preview Mockup */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="mt-24 relative max-w-5xl mx-auto group"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition duration-1000" />
            <div className="relative bg-bg border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="h-8 bg-surface border-b border-white/5 flex items-center px-4 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              </div>
              <div className="p-4 grid grid-cols-12 gap-4">
                {/* Simulated App UI */}
                <div className="col-span-3 space-y-4">
                  <div className="h-10 bg-surface/50 rounded-lg animate-pulse" />
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-6 bg-surface/30 rounded-md animate-pulse" style={{ width: `${80 - i * 10}%` }} />
                    ))}
                  </div>
                </div>
                <div className="col-span-9 space-y-4">
                  <div className="h-32 bg-gradient-to-br from-violet-600/20 to-transparent border border-violet-500/20 rounded-xl flex items-center justify-center">
                    <Activity className="w-12 h-12 text-violet-400 opacity-50" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-surface/50 border border-white/5 rounded-xl animate-pulse" />
                    ))}
                  </div>
                  <div className="h-40 bg-surface/30 rounded-xl animate-pulse" />
                </div>
              </div>
            </div>
            
            {/* Mobile View Overlay */}
            <div className="absolute -right-8 bottom-10 w-48 h-96 bg-bg border-4 border-surface rounded-[2rem] shadow-2xl hidden lg:block transform rotate-6 translate-y-10 group-hover:rotate-0 group-hover:translate-y-0 transition-all duration-700 overflow-hidden">
               <div className="h-4 bg-surface flex items-center justify-center">
                 <div className="w-12 h-1 bg-white/10 rounded-full" />
               </div>
               <div className="p-4 space-y-4">
                  <div className="h-8 bg-violet-600/20 rounded-lg" />
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="h-4 bg-white/5 rounded" />
                    ))}
                  </div>
                  <div className="h-20 bg-amber-500/20 rounded-xl" />
               </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 bg-surface/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs font-display font-bold uppercase tracking-[0.5em] text-violet-400 mb-4">Core Capabilities</h2>
            <h3 className="text-3xl md:text-5xl font-display font-black tracking-tighter uppercase">Engineered for Excellence</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <Zap className="w-6 h-6" />, title: "Instant Extraction", desc: "AI-powered data extraction from documents and images with 99.9% accuracy.", color: "violet" },
              { icon: <Shield className="w-6 h-6" />, title: "Bank-Level Security", desc: "Encrypted data storage with Supabase and restricted access protocols.", color: "cyan" },
              { icon: <History className="w-6 h-6" />, title: "Real-time History", desc: "Live audit logs and synchronization across all your devices instantly.", color: "amber" },
              { icon: <Activity className="w-6 h-6" />, title: "Deep Analytics", desc: "Advanced visualization of your maintenance cycles and cost distribution.", color: "rose" },
              { icon: <Smartphone className="w-6 h-6" />, title: "App-First Design", desc: "Switch from desktop to mobile view seamlessly with no loss of power.", color: "emerald" },
              { icon: <Globe className="w-6 h-6" />, title: "Global Marketplace", desc: "Access the unified marketplace for parts and services directly from the app.", color: "blue" },
            ].map((feature, i) => (
              <div key={i} className="p-8 bg-bg border border-white/5 rounded-[2rem] hover:border-violet-500/30 transition-all hover:bg-white/[0.02] group">
                <div className={`w-12 h-12 bg-${feature.color}-500/20 rounded-xl flex items-center justify-center mb-6 text-${feature.color}-400 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h4 className="text-lg font-display font-black uppercase tracking-widest mb-4">{feature.title}</h4>
                <p className="text-muted text-[10px] leading-relaxed uppercase tracking-widest opacity-60">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App vs Web Toggle Teaser */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1">
            <h2 className="text-4xl md:text-6xl font-display font-black tracking-tighter uppercase mb-8">
              One Engine,<br />
              <span className="text-violet-500">Dual Experience.</span>
            </h2>
            <p className="text-muted leading-relaxed uppercase tracking-widest text-sm mb-10">
              DT.Base is not just a website. It's a progressive platform that transforms based on your needs. Toggle between the high-productivity Web Interface and the focused App Experience anytime.
            </p>
            <div className="space-y-6">
              {[
                { label: "Web Intelligence", value: "Full control, advanced filters, batch processing." },
                { label: "Mobile Agility", value: "Quick entries, camera scanning, on-the-go audits." },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="mt-1">
                    <div className="w-2 h-2 bg-violet-500 rounded-full" />
                  </div>
                  <div>
                    <h5 className="font-display font-black uppercase text-xs mb-1">{item.label}</h5>
                    <p className="text-[10px] text-muted uppercase tracking-widest">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 w-full bg-surface/30 rounded-[3rem] p-12 border border-white/5 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-violet-600/10 to-transparent mx-auto" />
             <div className="relative flex justify-center gap-8">
               <div className="w-32 h-64 bg-bg border-4 border-surface rounded-2xl flex flex-col items-center justify-center gap-4">
                  <Smartphone className="w-8 h-8 text-violet-400 opacity-20" />
                  <div className="w-20 h-2 bg-white/5 rounded" />
                  <div className="w-16 h-2 bg-white/5 rounded" />
               </div>
               <div className="flex-1 h-64 bg-bg border-4 border-surface rounded-2xl p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <Globe className="w-6 h-6 text-cyan-400 opacity-20" />
                    <div className="flex gap-2">
                       <div className="w-3 h-3 rounded-full bg-white/5" />
                       <div className="w-3 h-3 rounded-full bg-white/5" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-white/5 rounded" />
                    <div className="h-4 bg-white/5 rounded" />
                    <div className="h-4 bg-white/5 rounded" style={{ width: '60%' }} />
                  </div>
                  <div className="h-10 bg-violet-600/10 rounded-lg" />
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto bg-gradient-to-r from-violet-600 to-indigo-600 rounded-[3rem] p-12 text-center text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.4)_100%)] ml-auto" />
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-display font-black tracking-tighter uppercase mb-8">
              Ready to Accelerate?
            </h2>
            <p className="text-white/70 text-sm md:text-base leading-relaxed mb-12 uppercase tracking-widest max-w-xl mx-auto">
              Join the next generation of logistics and maintenance tracking. Start your journey with DT.Base today.
            </p>
            <button 
              type="button"
              onClick={onLaunchApp}
              className="px-12 py-6 bg-white text-black font-display font-black uppercase tracking-[0.3em] text-sm rounded-2xl hover:scale-105 transition-all shadow-2xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Get Started Now
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 bg-surface/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded flex items-center justify-center">
              <Database className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-black tracking-tighter text-lg uppercase">DT.Base</span>
          </div>
          <div className="flex gap-8 text-[10px] font-display font-bold uppercase tracking-widest text-muted">
            <a href="#" className="hover:text-text">Privacy</a>
            <a href="#" className="hover:text-text">Terms</a>
            <a href="#" className="hover:text-text">Support</a>
            <a href="#" className="hover:text-text">Docs</a>
          </div>
          <p className="text-[10px] font-mono text-muted/50 uppercase">
            © 2026 DT.BASE LOGISTICS SYSTEMS. ALL RIGHTS RESERVED.
          </p>
        </div>
      </footer>
    </div>
  );
}
