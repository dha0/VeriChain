"use client";

import React, { useState } from "react";
import { Check, AlertCircle, ChevronDown, ChevronUp, ArrowRight, RefreshCw } from "lucide-react";
import { StepperState, StepperStep } from "@/lib/stepperEngine";

interface ProcessStepperProps {
  state: StepperState;
  onAction?: () => void;
  className?: string;
}

export const ProcessStepper: React.FC<ProcessStepperProps> = ({
  state,
  onAction,
  className = "",
}) => {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const { steps, currentStepId, nextStepGuide, hasError, errorMessage, actionText } = state;

  const totalSteps = steps.length;
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const currentStep = steps.find((s) => s.id === currentStepId) || steps[0];
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <div
      aria-label="Workflow Process Stepper"
      className={`w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 sm:p-5 mb-6 transition-all ${className}`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* 1. DESKTOP STEPPER VIEW (Horizontal with connectors) */}
      {/* ------------------------------------------------------------------ */}
      <nav aria-label="Progress steps" className="hidden md:block">
        <ol className="flex items-center justify-between w-full relative">
          {steps.map((step, idx) => {
            const isCompleted = step.status === "completed";
            const isCurrent = step.id === currentStepId;
            const isErr = step.status === "error";
            const isUnavailable = step.status === "unavailable";
            const isAvailable = step.status === "available";

            return (
              <li
                key={step.id}
                className="flex-1 relative flex flex-col items-center group"
                aria-current={isCurrent ? "step" : undefined}
              >
                {/* Horizontal Connector Line */}
                {idx < steps.length - 1 && (
                  <div
                    className={`absolute top-4 left-1/2 w-full h-0.5 transition-colors z-0 ${
                      isCompleted
                        ? "bg-emerald-500 dark:bg-emerald-600"
                        : "bg-slate-200 dark:bg-slate-700"
                    }`}
                    style={{ zIndex: 0 }}
                  />
                )}

                {/* Step Circle Badge */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs transition-all z-10 relative ${
                    isErr
                      ? "bg-rose-500 text-white ring-4 ring-rose-100 dark:ring-rose-950/60"
                      : isCompleted
                      ? "bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200 dark:ring-emerald-900"
                      : isCurrent
                      ? "bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950/80 shadow-md animate-pulse"
                      : isUnavailable
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-700"
                      : isAvailable
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {isErr ? (
                    <AlertCircle className="w-4 h-4 text-white" aria-hidden="true" />
                  ) : isCompleted ? (
                    <Check className="w-4 h-4 text-white stroke-[2.5]" aria-hidden="true" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Step Title & Subtitle */}
                <div className="mt-2 text-center max-w-[140px]">
                  <p
                    className={`text-xs font-semibold tracking-tight ${
                      isErr
                        ? "text-rose-600 dark:text-rose-400"
                        : isCurrent
                        ? "text-indigo-600 dark:text-indigo-400 font-bold"
                        : isCompleted
                        ? "text-slate-900 dark:text-slate-100"
                        : isUnavailable
                        ? "text-slate-400 dark:text-slate-500 italic"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* 2. MOBILE COMPACT STEPPER VIEW (Progress Bar + Expandable Details) */}
      {/* ------------------------------------------------------------------ */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                hasError
                  ? "bg-rose-500 text-white"
                  : "bg-indigo-600 text-white"
              }`}
            >
              {hasError ? "!" : currentIndex + 1}
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Step {currentIndex + 1} of {totalSteps}: {currentStep?.title}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {currentStep?.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileExpanded(!isMobileExpanded)}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs flex items-center p-1 rounded"
            aria-expanded={isMobileExpanded}
            aria-label="Toggle all steps"
          >
            {isMobileExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Compact Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              hasError ? "bg-rose-500" : "bg-indigo-600"
            }`}
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>

        {/* Expandable Step Accordion */}
        {isMobileExpanded && (
          <ol className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {steps.map((s, idx) => (
              <li key={s.id} className="flex items-start space-x-2 text-xs">
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] mt-0.5 ${
                    s.status === "completed"
                      ? "bg-emerald-500 text-white"
                      : s.status === "error"
                      ? "bg-rose-500 text-white"
                      : s.id === currentStepId
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {s.status === "completed" ? "✓" : idx + 1}
                </span>
                <div>
                  <span
                    className={`font-semibold ${
                      s.id === currentStepId
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {s.title}
                  </span>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    {s.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. ERROR / BLOCKED STATE BANNER (Rejection reason & fix action) */}
      {/* ------------------------------------------------------------------ */}
      {hasError && (
        <div
          role="alert"
          className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
        >
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                Action Required: Submission Rejected
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                {errorMessage || "Your submission was rejected by the reviewing authority."}
              </p>
            </div>
          </div>
          {actionText && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-rose-600 text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 transition-colors flex-shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              {actionText}
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. NEXT ACTION GUIDE ("Next: <step title> - <what to do>") */}
      {/* ------------------------------------------------------------------ */}
      {!hasError && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
            <ArrowRight className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
            <span className="font-medium">{nextStepGuide}</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 hidden sm:inline">
            {completedCount} of {totalSteps} Completed ({progressPercent}%)
          </span>
        </div>
      )}
    </div>
  );
};
