import React, { useEffect, useRef, useState } from 'react';
import { PlayIcon, ActivityIcon, HospitalIcon, AwardIcon } from './Icons';

// Animated counter hook
const useCountUp = (target, duration = 2000) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const counted = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !counted.current) {
          counted.current = true;
          const start = performance.now();
          const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(target * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
};

export const LandingScreen = ({ onNavigate }) => {
  const stat1 = useCountUp(5, 1800);
  const stat2 = useCountUp(85, 2200);
  const stat3 = useCountUp(0, 1500);

  return (
    <div className="animate-fade-in landing-hero-bg" style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', textAlign: 'left' }}>

      {/* Floating orbs */}
      <div className="landing-orb landing-orb-1" />
      <div className="landing-orb landing-orb-2" />
      <div className="landing-orb landing-orb-3" />

      {/* Hero Section */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '80px', marginTop: '40px', position: 'relative', zIndex: 1 }}>
        <div className="hero-badge" style={{ marginBottom: '24px' }}>
          <ActivityIcon className="w-4 h-4" /> Telerehabilitation Platform for PLP
        </div>

        <h1 className="hero-gradient-text" style={{
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          lineHeight: '1.1',
          marginBottom: '20px',
          fontFamily: 'var(--font-display)',
          fontWeight: 800
        }}>
          PhantomTouch
        </h1>

        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', maxWidth: '700px', lineHeight: '1.7', marginBottom: '36px' }}>
          An interactive 3D mirror therapy web application. Track, mirror, and reconstruct your physical range of motion in real-time to alleviate Phantom Limb Pain — no VR gear required.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => onNavigate('login')} style={{ padding: '12px 28px', fontSize: '1rem' }}>
            <PlayIcon className="w-5 h-5" /> Start Therapy Session
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('register')} style={{ padding: '12px 28px', fontSize: '1rem' }}>
            Sign Up as Clinician
          </button>
        </div>
      </section>

      {/* Stats Section */}
      <section className="landing-stats" style={{ position: 'relative', zIndex: 1 }}>
        <div className="landing-stat-item" ref={stat1.ref}>
          <div className="landing-stat-number stat-purple">{stat1.count}M+</div>
          <div className="landing-stat-label">Amputees Worldwide</div>
        </div>
        <div className="landing-stat-item" ref={stat2.ref}>
          <div className="landing-stat-number stat-cyan">{stat2.count}%</div>
          <div className="landing-stat-label">Pain Reduction Reported</div>
        </div>
        <div className="landing-stat-item" ref={stat3.ref}>
          <div className="landing-stat-number stat-green">$0</div>
          <div className="landing-stat-label">Hardware Required</div>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="stagger-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '80px', position: 'relative', zIndex: 1 }}>

        {/* The Problem */}
        <div className="glass-panel glass-panel-glow-purple p-8 feature-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="feature-icon" style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--accent-purple-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
            <AwardIcon className="w-6 h-6" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)' }}>The Problem</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '0.93rem' }}>
            Following limb loss, the brain continues sending "move" commands to the missing arm. Lacking visual confirmation, the neural feedback loop misfires — translating into severe phantom pain.
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '0.93rem' }}>
            Existing 2D mirror apps fail because flat reflections warp when a patient turns. Physical mirrors are bulky, and clinics lack remote tracking.
          </p>
        </div>

        {/* The Science */}
        <div className="glass-panel glass-panel-glow-cyan p-8 feature-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="feature-icon" style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--accent-cyan-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
            <ActivityIcon className="w-6 h-6" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)' }}>Scientific Validation</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '0.93rem' }}>
            Studies in the <strong>New England Journal of Medicine</strong> confirm that daily Mirror Therapy significantly lowers pain intensity by tricking the motor cortex into "seeing" the missing limb move.
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '0.93rem' }}>
            Our 3D model translates webcam input, mirrors coordinates, and renders a realistic ghost limb matching wrist rotations for immersive neural correction.
          </p>
        </div>

        {/* The Business */}
        <div className="glass-panel p-8 feature-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="feature-icon" style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
            <HospitalIcon className="w-6 h-6" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)' }}>Telerehabilitation B2B</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '0.93rem' }}>
            The global telerehabilitation market is valued at $6-7 billion in 2026 and growing at 13-15% annually.
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '0.93rem' }}>
            <strong>Monetization:</strong> Free for patients at home. Premium B2B dashboard suite licensed to hospitals and physiotherapists for remote diagnostics and session audits.
          </p>
        </div>
      </section>

      {/* Tech Stack */}
      <section style={{ textAlign: 'center', padding: '60px 40px', background: 'var(--bg-secondary)', borderRadius: '24px', border: '1px solid var(--border-color)', marginBottom: '60px', position: 'relative', zIndex: 1 }}>
        <h2 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-display)', marginBottom: '10px' }}>Client-Side Browser Execution</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '800px', margin: '0 auto 40px', lineHeight: '1.6' }}>
          All processing happens locally in your browser. Hands are tracked using Google MediaPipe and rendered into a WebGL context via Three.js — zero data leaves your device.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { name: 'React 19', desc: 'UI Component State', color: 'var(--accent-purple)' },
            { name: 'MediaPipe', desc: '21-Point Joint Tracking', color: 'var(--accent-cyan)' },
            { name: 'Three.js', desc: '3D WebGL Ghost Limb', color: 'var(--success)' },
            { name: 'Supabase', desc: 'Auth & Telemetry', color: 'var(--text-primary)' },
          ].map((tech) => (
            <div key={tech.name} className="tech-card" style={{
              padding: '18px 28px',
              background: 'var(--bg-primary)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              minWidth: '150px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <strong style={{ display: 'block', color: tech.color, fontSize: '1.15rem', marginBottom: '4px' }}>{tech.name}</strong>
              <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{tech.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta" style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{ fontFamily: 'var(--font-display)' }}>Ready to Begin Your Therapy?</h2>
        <p>
          Join thousands of patients and clinicians using PhantomTouch to manage phantom limb pain from the comfort of home.
        </p>
        <div className="cta-buttons">
          <button className="btn btn-primary" onClick={() => onNavigate('register')} style={{ padding: '13px 32px', fontSize: '1rem' }}>
            Create Free Account
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('login')} style={{ padding: '13px 32px', fontSize: '1rem' }}>
            Sign In
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer" style={{ position: 'relative', zIndex: 1 }}>
        <div className="landing-footer-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              backgroundColor: 'var(--accent-cyan)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(6, 182, 212, 0.25)'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" /><path d="M14 10V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" /><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9" /><path d="M6 14.5V11a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4v-3" />
              </svg>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem' }}>
              <span style={{ color: 'var(--text-primary)' }}>Phantom</span>
              <span style={{ color: 'var(--accent-cyan)' }}>Touch</span>
            </span>
          </div>
          <p>Browser-based 3D mirror therapy for phantom limb pain management. Free for patients, B2B licensing for healthcare providers.</p>
        </div>

        <div className="landing-footer-col">
          <h4>Platform</h4>
          <ul>
            <li>Mirror Therapy</li>
            <li>Hand Tracking</li>
            <li>3D Ghost Limb</li>
            <li>Patient Dashboard</li>
          </ul>
        </div>

        <div className="landing-footer-col">
          <h4>For Clinicians</h4>
          <ul>
            <li>Remote Monitoring</li>
            <li>Session Analytics</li>
            <li>Prescription Config</li>
            <li>B2B Licensing</li>
          </ul>
        </div>

        <div className="landing-footer-bottom">
          <p>&copy; {new Date().getFullYear()} PhantomTouch. All rights reserved.</p>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span>Free Tier Patient Access</span>
            <span>B2B Hospital SaaS Licensing</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
