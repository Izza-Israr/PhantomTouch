import React from 'react';
import { PlayIcon, ActivityIcon, HospitalIcon, AwardIcon } from './Icons';

export const LandingScreen = ({ onNavigate }) => {
  return (
    <div className="animate-fade-in" style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', textAlign: 'left' }}>
      
      {/* Hero Section */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '80px', marginTop: '40px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          borderRadius: '50px',
          background: 'var(--accent-purple-dim)',
          border: '1px solid rgba(170, 59, 255, 0.3)',
          color: 'var(--accent-purple)',
          fontSize: '0.9rem',
          fontWeight: 600,
          marginBottom: '24px'
        }}>
          <ActivityIcon className="w-4 h-4" /> Telerehabilitation Platform for PLP
        </div>
        
        <h1 style={{ 
          fontSize: '3.5rem', 
          lineHeight: '1.1', 
          background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent',
          marginBottom: '20px',
          fontFamily: 'var(--font-display)',
          fontWeight: 800
        }}>
          PhantomTouch
        </h1>
        
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', maxWidth: '700px', lineHeight: '1.6', marginBottom: '32px' }}>
          An interactive 3D mirror therapy web application. Track, mirror, and reconstruct your physical range of motion in real-time to alleviate Phantom Limb Pain—no VR gear required.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => onNavigate('login')}>
            <PlayIcon className="w-5 h-5" /> Start Therapy Session
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('register')}>
            Sign Up as Clinician
          </button>
        </div>
      </section>

      {/* Grid of Problem and Science */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px', marginBottom: '80px' }}>
        
        {/* The Problem */}
        <div className="glass-panel glass-panel-glow-purple p-8" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-purple-dim)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
            <AwardIcon className="w-6 h-6" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>The Hook & Problem</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            Following limb loss, the brain continues sending "move" commands to the missing arm. Lacking visual confirmation, the neural feedback loop misfires, translating into severe phantom pain (burning, crushing, squeezing). 
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            Existing 2D mirror apps fail because flat reflections warp immediately when a patient turns, breaking the visual illusion. Physical mirrors are bulky, and clinical clinics lack remote patient tracking.
          </p>
        </div>

        {/* The Scientific Proof */}
        <div className="glass-panel glass-panel-glow-cyan p-8" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-cyan-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
            <ActivityIcon className="w-6 h-6" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>Scientific Validation</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            Studies in the <strong>New England Journal of Medicine</strong> confirm that daily Mirror Therapy significantly lowers pain intensity and duration by tricking the motor cortex into "seeing" the missing limb move.
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            Our 3D model translates the webcam input of your healthy arm, mirrors coordinates, and renders a realistic ghost limb matching wrist rotations, providing an immersive neural correction.
          </p>
        </div>

        {/* The Business Edge */}
        <div className="glass-panel p-8" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
            <HospitalIcon className="w-6 h-6" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>Telerehabilitation B2B</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            The global telerehabilitation market is valued at $6-7 billion in 2026 and growing at 13-15% annually. 
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
            <strong>Monetization:</strong> While we keep the portal free for individual patients at home, we license a premium B2B dashboard suite to rehabilitation hospitals and private physiotherapists for remote diagnostics, session audits, and prescription configurations.
          </p>
        </div>

      </section>

      {/* Core Tech Stack */}
      <section style={{ textAlign: 'center', padding: '60px 40px', background: 'var(--bg-secondary)', borderRadius: '24px', border: '1px solid var(--border-color)', marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-display)', marginBottom: '16px' }}>Client-Side Browser Execution</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '800px', margin: '0 auto 40px', lineHeight: '1.6' }}>
          To maintain strict data privacy and keep compute costs at zero, our engine processes camera feeds locally. Hands are isolated using Google MediaPipe and rendered into a WebGL context via Three.js.
        </p>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ padding: '16px 24px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
            <strong style={{ display: 'block', color: 'var(--accent-purple)', fontSize: '1.2rem' }}>React 19</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>UI Component State</span>
          </div>
          <div style={{ padding: '16px 24px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
            <strong style={{ display: 'block', color: 'var(--accent-cyan)', fontSize: '1.2rem' }}>MediaPipe</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>21-Point Joint Tracking</span>
          </div>
          <div style={{ padding: '16px 24px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
            <strong style={{ display: 'block', color: '#10b981', fontSize: '1.2rem' }}>Three.js</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>3D WebGL Ghost Limb</span>
          </div>
          <div style={{ padding: '16px 24px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
            <strong style={{ display: 'block', color: '#fff', fontSize: '1.2rem' }}>Node & Mongo</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Telemetry Storage</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-color)', paddingTop: '30px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <p>&copy; {new Date().getFullYear()} PhantomTouch. All rights reserved.</p>
        <div style={{ display: 'flex', gap: '20px' }}>
          <span>Free Tier Patient Access</span>
          <span>B2B Hospital SaaS Licensing</span>
        </div>
      </footer>

    </div>
  );
};
