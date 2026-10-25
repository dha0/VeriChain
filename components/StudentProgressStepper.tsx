"use client";

import React from "react";

export type StepState = "complete" | "current" | "pending" | "error";

export interface ProgressStep {
  label: string;
  hint?: string;
  state: StepState;
  targetId?: string;
}

const circleStyles: Record<StepState, string> = {
  complete: "bg-emerald-500 border-emerald-300 shadow-emerald-500/40",
  current: "bg-indigo-500 border-indigo-300 shadow-indigo-500/50 animate-pulse",
  pending: "bg-slate-700 border-slate-500 shadow-transparent",
  error: "bg-rose-500 border-rose-300 shadow-rose-500/40",
};

const labelStyles: Record<StepState, string> = {
  complete: "text-emerald-300",
  current: "text-indigo-300",
  pending: "text-slate-500",
  error: "text-rose-300",
};

export function StudentProgressStepper({ steps }: { steps: ProgressStep[] }) {
  const go = (id?: string) => {
    if (!id || typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Student progress"
      className="mx-auto max-w-3xl rounded-2xl border border-indigo-500/20 bg-slate-900/60 px-4 py-4"
    >
      <ol className="flex items-start justify-between">
        {steps.map((step, i) => (
          <li key={step.label} className="relative flex flex-1 flex-col items-center text-center">
            {/* connecting line to the next step */}
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-1/2 top-[9px] h-0.5 w-full ${
                  step.state === "complete" ? "bg-emerald-500" : "bg-slate-700"
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => go(step.targetId)}
              title={step.hint || step.label}
              aria-current={step.state === "current" ? "step" : undefined}
              className="group relative z-10 flex flex-col items-center gap-1.5 focus:outline-none"
            >
              <span
                className={`block h-[18px] w-[18px] rounded-full border-2 shadow-md transition-transform group-hover:scale-125 ${circleStyles[step.state]}`}
              />
              <span className={`text-[10px] font-semibold leading-tight px-1 ${labelStyles[step.state]}`}>
                {step.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Completed</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-indigo-500" /> In progress</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-600" /> Pending</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-500" /> Rejected</span>
      </div>
    </nav>
  );
}
