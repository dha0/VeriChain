import React from "react";

/**
 * University Building Illustration matching the user's screenshot
 * Features classical columns, dome, warm glowing windows, and a floating graduation cap.
 */
export const UniversityBanner: React.FC<{ isHovered?: boolean }> = ({ isHovered }) => {
  return (
    <div className="relative w-full h-36 rounded-2xl overflow-hidden bg-gradient-to-b from-blue-950 via-slate-900 to-slate-950 border border-blue-500/20 shadow-inner group">
      {/* Sky Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(59,130,246,0.35),transparent_70%)]" />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-16 bg-cyan-400/20 rounded-full blur-xl pointer-events-none" />

      {/* Floating Graduation Cap */}
      <div
        className={`absolute top-4 right-6 w-9 h-7 text-cyan-400 transition-transform duration-500 ${
          isHovered ? "scale-110 -translate-y-1 rotate-3" : "scale-100 rotate-[-6deg]"
        }`}
      >
        <svg viewBox="0 0 64 48" fill="none" className="w-full h-full drop-shadow-[0_2px_8px_rgba(6,182,212,0.6)]">
          <polygon points="32,4 60,18 32,32 4,18" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" />
          <polygon points="32,8 52,18 32,28 12,18" fill="#38bdf8" opacity="0.4" />
          <path d="M16 24 V34 C16 38 48 38 48 34 V24" fill="#0369a1" stroke="#38bdf8" strokeWidth="2" />
          <line x1="56" y1="19" x2="56" y2="34" stroke="#e0f2fe" strokeWidth="2" />
          <circle cx="56" cy="35" r="2.5" fill="#fde047" />
        </svg>
      </div>

      {/* Classical University Building SVG */}
      <svg
        viewBox="0 0 320 144"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        className="absolute bottom-0 inset-x-0 w-full h-full"
      >
        {/* Dome */}
        <circle cx="160" cy="56" r="14" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1.5" />
        <circle cx="160" cy="56" r="4" fill="#fde047" className="animate-pulse" />
        <rect x="156" y="66" width="8" height="6" fill="#1e293b" />

        {/* Roof Pediment / Triangle */}
        <polygon points="90,72 230,72 160,42" fill="#0f172a" stroke="#3b82f6" strokeWidth="2" />
        <polygon points="106,70 214,70 160,48" fill="#1e293b" opacity="0.7" />

        {/* Architrave */}
        <rect x="96" y="72" width="128" height="6" fill="#1e293b" stroke="#3b82f6" strokeWidth="1" />

        {/* 4 Pillars */}
        <rect x="110" y="78" width="12" height="42" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.2" />
        <rect x="142" y="78" width="12" height="42" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.2" />
        <rect x="166" y="78" width="12" height="42" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.2" />
        <rect x="198" y="78" width="12" height="42" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.2" />

        {/* Glowing Windows between pillars */}
        <rect x="126" y="86" width="12" height="14" rx="2" fill="#fde047" className="drop-shadow-[0_0_6px_rgba(253,224,71,0.7)]" />
        <rect x="182" y="86" width="12" height="14" rx="2" fill="#fde047" className="drop-shadow-[0_0_6px_rgba(253,224,71,0.7)]" />

        {/* Central Arched Doorway */}
        <path d="M152 120 V98 A8 8 0 0 1 168 98 V120 Z" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.2" />
        <circle cx="160" cy="106" r="2.5" fill="#fde047" />

        {/* Steps Base */}
        <rect x="76" y="120" width="168" height="6" fill="#1e293b" stroke="#3b82f6" strokeWidth="1" />
        <rect x="64" y="126" width="192" height="6" fill="#0f172a" stroke="#1d4ed8" strokeWidth="1" />
        <rect x="52" y="132" width="216" height="8" fill="#090d16" />

        {/* Outer Wings */}
        <rect x="56" y="88" width="40" height="32" fill="#0b1329" stroke="#1e3a8a" strokeWidth="1" />
        <rect x="64" y="96" width="8" height="10" rx="1" fill="#fde047" opacity="0.8" />
        <rect x="80" y="96" width="8" height="10" rx="1" fill="#fde047" opacity="0.8" />

        <rect x="224" y="88" width="40" height="32" fill="#0b1329" stroke="#1e3a8a" strokeWidth="1" />
        <rect x="232" y="96" width="8" height="10" rx="1" fill="#fde047" opacity="0.8" />
        <rect x="248" y="96" width="8" height="10" rx="1" fill="#fde047" opacity="0.8" />
      </svg>
    </div>
  );
};

/**
 * Company Recruiter Skyline Illustration matching the user's screenshot
 * Features green skyline with glowing office grid windows and glowing briefcase icon.
 */
export const CompanyBanner: React.FC<{ isHovered?: boolean }> = ({ isHovered }) => {
  return (
    <div className="relative w-full h-36 rounded-2xl overflow-hidden bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 border border-emerald-500/20 shadow-inner group">
      {/* Sky Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.35),transparent_70%)]" />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-16 bg-emerald-400/20 rounded-full blur-xl pointer-events-none" />

      {/* Floating Briefcase Icon */}
      <div
        className={`absolute top-4 left-6 w-8 h-8 text-emerald-400 transition-transform duration-500 ${
          isHovered ? "scale-110 -translate-y-1" : "scale-100"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full drop-shadow-[0_2px_8px_rgba(16,185,129,0.7)]">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" fill="#064e3b" stroke="#34d399" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" stroke="#34d399" />
        </svg>
      </div>

      {/* IT City Skyline SVG with Glowing Windows */}
      <svg
        viewBox="0 0 320 144"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        className="absolute bottom-0 inset-x-0 w-full h-full"
      >
        {/* Background Building Silhouette */}
        <rect x="40" y="55" width="45" height="89" fill="#022c22" opacity="0.6" />
        <rect x="235" y="45" width="45" height="99" fill="#022c22" opacity="0.6" />

        {/* Tower 1 (Left-Mid) */}
        <rect x="80" y="40" width="38" height="104" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
        {/* Grid Windows */}
        {[52, 68, 84, 100, 116].map((y, i) => (
          <g key={i}>
            <rect x="88" y={y} width="7" height="7" rx="1" fill={i % 2 === 0 ? "#34d399" : "#6ee7b7"} className="drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
            <rect x="102" y={y} width="7" height="7" rx="1" fill={i % 3 === 0 ? "#86efac" : "#059669"} />
          </g>
        ))}

        {/* Tower 2 (Center Main Highrise) */}
        <rect x="124" y="22" width="62" height="122" fill="#022c22" stroke="#34d399" strokeWidth="1.5" />
        <polygon points="155,8 152,22 158,22" fill="#34d399" />
        <line x1="155" y1="4" x2="155" y2="8" stroke="#fde047" strokeWidth="1.5" className="animate-pulse" />

        {/* Center Highrise Windows Matrix */}
        {[30, 44, 58, 72, 86, 100, 114].map((y, rowIdx) => (
          <g key={rowIdx}>
            <rect x="132" y={y} width="6" height="6" rx="1" fill={rowIdx % 2 === 0 ? "#fef08a" : "#34d399"} className="drop-shadow-[0_0_4px_rgba(52,211,153,0.7)]" />
            <rect x="144" y={y} width="6" height="6" rx="1" fill={rowIdx % 3 === 0 ? "#a7f3d0" : "#059669"} />
            <rect x="156" y={y} width="6" height="6" rx="1" fill={rowIdx % 2 === 1 ? "#34d399" : "#fde047"} className="drop-shadow-[0_0_4px_rgba(253,224,71,0.8)]" />
            <rect x="168" y={y} width="6" height="6" rx="1" fill={rowIdx % 4 === 0 ? "#fef08a" : "#10b981"} />
          </g>
        ))}

        {/* Tower 3 (Right-Mid) */}
        <rect x="192" y="36" width="42" height="108" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
        {[48, 64, 80, 96, 112].map((y, i) => (
          <g key={i}>
            <rect x="200" y={y} width="7" height="7" rx="1" fill={i % 2 === 1 ? "#34d399" : "#6ee7b7"} className="drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
            <rect x="216" y={y} width="7" height="7" rx="1" fill={i % 3 === 1 ? "#fde047" : "#047857"} />
          </g>
        ))}

        {/* Ground Base */}
        <rect x="0" y="136" width="320" height="8" fill="#021a14" />
      </svg>
    </div>
  );
};

/**
 * Student Candidate Illustration matching the user's screenshot
 * Features diploma certificate with gold seal ribbon and purple academic graduation cap.
 */
export const StudentBanner: React.FC<{ isHovered?: boolean }> = ({ isHovered }) => {
  return (
    <div className="relative w-full h-36 rounded-2xl overflow-hidden bg-gradient-to-b from-purple-950 via-slate-900 to-slate-950 border border-purple-500/20 shadow-inner group">
      {/* Sky Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(168,85,247,0.35),transparent_70%)]" />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-16 bg-purple-400/20 rounded-full blur-xl pointer-events-none" />

      {/* Graduation Cap (Left) */}
      <div
        className={`absolute top-6 left-6 w-16 h-12 text-indigo-400 transition-transform duration-500 ${
          isHovered ? "scale-110 -translate-y-1 rotate-2" : "scale-100 rotate-[-8deg]"
        }`}
      >
        <svg viewBox="0 0 64 48" fill="none" className="w-full h-full drop-shadow-[0_4px_12px_rgba(147,51,234,0.6)]">
          <polygon points="32,4 60,18 32,32 4,18" fill="#4338ca" stroke="#818cf8" strokeWidth="2" />
          <polygon points="32,8 52,18 32,28 12,18" fill="#818cf8" opacity="0.4" />
          <path d="M16 24 V34 C16 38 48 38 48 34 V24" fill="#312e81" stroke="#818cf8" strokeWidth="2" />
          <line x1="56" y1="19" x2="56" y2="34" stroke="#fef08a" strokeWidth="2" />
          <circle cx="56" cy="35" r="2.5" fill="#fde047" />
        </svg>
      </div>

      {/* Certificate / Diploma Parchment (Right) */}
      <div
        className={`absolute bottom-3 right-6 w-32 h-24 transition-transform duration-500 ${
          isHovered ? "scale-105 -translate-y-1" : "scale-100"
        }`}
      >
        <svg viewBox="0 0 128 96" fill="none" className="w-full h-full drop-shadow-[0_4px_16px_rgba(168,85,247,0.5)]">
          {/* Certificate Paper */}
          <rect x="4" y="4" width="120" height="88" rx="4" fill="#ffffff" stroke="#93c5fd" strokeWidth="2" />
          <rect x="8" y="8" width="112" height="80" rx="2" fill="#f8fafc" stroke="#bfdbfe" strokeWidth="1" />

          {/* Header Bar */}
          <rect x="18" y="16" width="60" height="6" rx="2" fill="#3b82f6" />
          <rect x="18" y="26" width="40" height="4" rx="1.5" fill="#94a3b8" />

          {/* Body Lines */}
          <rect x="18" y="38" width="75" height="3" rx="1" fill="#cbd5e1" />
          <rect x="18" y="45" width="85" height="3" rx="1" fill="#cbd5e1" />
          <rect x="18" y="52" width="65" height="3" rx="1" fill="#cbd5e1" />
          <rect x="18" y="59" width="50" height="3" rx="1" fill="#cbd5e1" />

          {/* Signature Line */}
          <line x1="18" y1="76" x2="45" y2="76" stroke="#64748b" strokeWidth="1.5" />

          {/* Gold Rosette Ribbon & Seal */}
          <g transform="translate(92, 54)">
            <circle cx="14" cy="14" r="12" fill="#eab308" stroke="#ca8a04" strokeWidth="1.5" />
            <circle cx="14" cy="14" r="9" fill="#fef08a" />
            <polygon points="10,24 8,36 14,32 20,36 18,24" fill="#dc2626" />
            <polygon points="12,24 10,34 14,31 18,34 16,24" fill="#ef4444" />
          </g>
        </svg>
      </div>

      {/* Subtle floating sparkles */}
      <div className="absolute top-3 left-1/2 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-ping opacity-75" />
      <div className="absolute top-10 right-44 w-1 h-1 bg-cyan-300 rounded-full animate-pulse" />
    </div>
  );
};

/**
 * Large Ambient Background Watermarks
 * Cross-fades dynamically when activePortal changes (University / Company / Student).
 */
/**
 * Admin Console Governance Background Watermark
 * Features shield, blockchain nodes, lock, governance grid lines.
 */
export const AdminBackgroundWatermark: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Dark deep navy base overlay for light mode */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 via-indigo-950/10 to-slate-900/5 dark:from-slate-950/40 dark:via-purple-950/20 dark:to-slate-950/40" />

      {/* Blockchain node network SVG */}
      <svg
        viewBox="0 0 900 600"
        fill="none"
        className="absolute inset-0 w-full h-full opacity-[0.04] dark:opacity-[0.07] text-indigo-600 dark:text-purple-400"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Shield outline - centered large */}
        <path
          d="M450 30 L590 90 L590 270 C590 370 450 440 450 440 C450 440 310 370 310 270 L310 90 Z"
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M450 60 L565 112 L565 270 C565 355 450 415 450 415 C450 415 335 355 335 270 L335 112 Z"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          opacity="0.4"
        />
        {/* Chain nodes */}
        <circle cx="100" cy="100" r="18" stroke="currentColor" strokeWidth="3" opacity="0.6" />
        <circle cx="200" cy="180" r="14" stroke="currentColor" strokeWidth="3" opacity="0.5" />
        <circle cx="150" cy="300" r="16" stroke="currentColor" strokeWidth="3" opacity="0.5" />
        <circle cx="80" cy="420" r="12" stroke="currentColor" strokeWidth="3" opacity="0.4" />
        <circle cx="220" cy="500" r="14" stroke="currentColor" strokeWidth="3" opacity="0.4" />
        <circle cx="800" cy="80" r="18" stroke="currentColor" strokeWidth="3" opacity="0.6" />
        <circle cx="720" cy="190" r="14" stroke="currentColor" strokeWidth="3" opacity="0.5" />
        <circle cx="820" cy="320" r="16" stroke="currentColor" strokeWidth="3" opacity="0.5" />
        <circle cx="760" cy="460" r="12" stroke="currentColor" strokeWidth="3" opacity="0.4" />
        <circle cx="680" cy="540" r="14" stroke="currentColor" strokeWidth="3" opacity="0.4" />
        {/* Node connection lines */}
        <line x1="100" y1="100" x2="200" y2="180" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="200" y1="180" x2="150" y2="300" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="150" y1="300" x2="80" y2="420" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="80" y1="420" x2="220" y2="500" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="800" y1="80" x2="720" y2="190" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="720" y1="190" x2="820" y2="320" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="820" y1="320" x2="760" y2="460" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="760" y1="460" x2="680" y2="540" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        {/* Cross connections to shield */}
        <line x1="200" y1="180" x2="310" y2="180" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 6" opacity="0.25" />
        <line x1="720" y1="190" x2="590" y2="190" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 6" opacity="0.25" />
        {/* Lock icon at shield center */}
        <rect x="426" y="190" width="48" height="36" rx="6" stroke="currentColor" strokeWidth="3" opacity="0.5" />
        <path d="M438 190 V178 A12 12 0 0 1 462 178 V190" stroke="currentColor" strokeWidth="3" opacity="0.5" />
        <circle cx="450" cy="210" r="5" stroke="currentColor" strokeWidth="2.5" opacity="0.5" />
        {/* Horizontal governance grid lines */}
        <line x1="0" y1="490" x2="900" y2="490" stroke="currentColor" strokeWidth="1" strokeDasharray="12 8" opacity="0.15" />
        <line x1="0" y1="520" x2="900" y2="520" stroke="currentColor" strokeWidth="1" strokeDasharray="12 8" opacity="0.1" />
        <line x1="0" y1="550" x2="900" y2="550" stroke="currentColor" strokeWidth="1" strokeDasharray="12 8" opacity="0.08" />
      </svg>
    </div>
  );
};

export const BackgroundWatermark: React.FC<{
  activePortal?: "university" | "company" | "student";
}> = ({ activePortal = "student" }) => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* 1. University Architectural Hall Watermark */}
      <div
        className={`absolute -top-10 left-1/2 -translate-x-1/2 w-[850px] max-w-[95vw] h-[550px] transition-all duration-700 ease-in-out ${
          activePortal === "university"
            ? "opacity-25 dark:opacity-30 scale-100"
            : "opacity-0 scale-95"
        }`}
      >
        <svg viewBox="0 0 600 400" fill="none" className="w-full h-full text-blue-500 dark:text-blue-400">
          {/* Triangular pediment & giant columns */}
          <polygon points="100,160 500,160 300,50" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.4" />
          <circle cx="300" cy="115" r="24" stroke="currentColor" strokeWidth="2" opacity="0.5" />
          <line x1="80" y1="160" x2="520" y2="160" stroke="currentColor" strokeWidth="4" opacity="0.6" />
          {/* Colonnade */}
          {[140, 190, 240, 310, 360, 410, 460].map((x, i) => (
            <line key={i} x1={x} y1="165" x2={x} y2="350" stroke="currentColor" strokeWidth="4" opacity="0.35" />
          ))}
          {/* Arched center entrance */}
          <path d="M260 350 V260 A40 40 0 0 1 340 260 V350" stroke="currentColor" strokeWidth="3" opacity="0.5" />
          <line x1="60" y1="350" x2="540" y2="350" stroke="currentColor" strokeWidth="5" opacity="0.5" />
        </svg>
      </div>

      {/* 2. IT Company Skyscraper Skyline Watermark */}
      <div
        className={`absolute -top-10 left-1/2 -translate-x-1/2 w-[850px] max-w-[95vw] h-[550px] transition-all duration-700 ease-in-out ${
          activePortal === "company"
            ? "opacity-25 dark:opacity-30 scale-100"
            : "opacity-0 scale-95"
        }`}
      >
        <svg viewBox="0 0 600 400" fill="none" className="w-full h-full text-emerald-500 dark:text-emerald-400">
          {/* High-rise outlines & antennas */}
          <rect x="180" y="80" width="90" height="300" stroke="currentColor" strokeWidth="3" opacity="0.4" />
          <line x1="225" y1="20" x2="225" y2="80" stroke="currentColor" strokeWidth="3" opacity="0.6" />
          <rect x="290" y="50" width="110" height="330" stroke="currentColor" strokeWidth="3" opacity="0.5" />
          <line x1="345" y1="10" x2="345" y2="50" stroke="currentColor" strokeWidth="3" opacity="0.7" />
          <circle cx="345" cy="10" r="4" fill="currentColor" opacity="0.8" />
          <rect x="420" y="110" width="80" height="270" stroke="currentColor" strokeWidth="3" opacity="0.4" />
          <rect x="90" y="130" width="75" height="250" stroke="currentColor" strokeWidth="3" opacity="0.35" />
          {/* Large Briefcase Outline */}
          <rect x="40" y="40" width="90" height="70" rx="8" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
          <path d="M65 40 V25 A10 10 0 0 1 105 25 V40" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
        </svg>
      </div>

      {/* 3. Student Degree Certificate & Cap Watermark */}
      <div
        className={`absolute -top-10 left-1/2 -translate-x-1/2 w-[850px] max-w-[95vw] h-[550px] transition-all duration-700 ease-in-out ${
          activePortal === "student"
            ? "opacity-25 dark:opacity-30 scale-100"
            : "opacity-0 scale-95"
        }`}
      >
        <svg viewBox="0 0 600 400" fill="none" className="w-full h-full text-purple-500 dark:text-purple-400">
          {/* Giant Mortarboard Cap */}
          <polygon points="300,50 480,120 300,190 120,120" stroke="currentColor" strokeWidth="3" opacity="0.5" />
          <path d="M180 150 V200 C180 230 420 230 420 200 V150" stroke="currentColor" strokeWidth="3" opacity="0.4" />
          <line x1="460" y1="125" x2="460" y2="210" stroke="currentColor" strokeWidth="3" opacity="0.6" />
          <circle cx="460" cy="215" r="8" stroke="currentColor" strokeWidth="2" opacity="0.7" />
          {/* Certificate Outline behind */}
          <rect x="180" y="160" width="280" height="200" rx="10" stroke="currentColor" strokeWidth="3" opacity="0.35" />
          <line x1="220" y1="210" x2="350" y2="210" stroke="currentColor" strokeWidth="3" opacity="0.4" />
          <line x1="220" y1="240" x2="420" y2="240" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <line x1="220" y1="265" x2="400" y2="265" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <circle cx="400" cy="310" r="22" stroke="currentColor" strokeWidth="2" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
};
