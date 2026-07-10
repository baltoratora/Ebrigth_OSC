"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";

type Tone = "blue" | "green" | "orange" | "red";

interface StatCardProps {
  label:    string;
  value:    number;
  icon:     LucideIcon;
  tone:     Tone;
  subtitle?: string;
  tooltip?:  string;
}

const TONE: Record<Tone, { badge: string; value: string; bar: string }> = {
  blue:   { badge: "bg-blue-50 text-blue-600",     value: "text-blue-600",   bar: "from-blue-400 to-blue-600" },
  green:  { badge: "bg-green-50 text-green-600",   value: "text-green-600",  bar: "from-green-400 to-green-600" },
  orange: { badge: "bg-orange-50 text-orange-600", value: "text-orange-500", bar: "from-orange-400 to-orange-600" },
  red:    { badge: "bg-red-50 text-red-600",       value: "text-red-500",    bar: "from-red-400 to-red-600" },
};

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded     = useTransform(motionValue, latest => Math.round(latest));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsubscribe = rounded.on("change", v => setDisplay(v));
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value, motionValue, rounded]);

  return <>{display}</>;
}

export default function StatCard({ label, value, icon: Icon, tone, subtitle, tooltip }: StatCardProps) {
  const t = TONE[tone];

  const card = (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="group relative overflow-hidden bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 cursor-default"
    >
      <div className={`h-[2px] w-full bg-gradient-to-r ${t.bar}`} />

      <div className="p-6">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${t.badge}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <p className={`text-4xl font-extrabold tracking-tight ${t.value} text-left leading-none`}>
              <AnimatedNumber value={value} />
            </p>
            <p className="text-[13px] font-semibold text-gray-600 mt-1.5 text-left">{label}</p>
            {subtitle ? (
              <p className="text-xs text-gray-400 mt-0.5 text-left">{subtitle}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-0.5">&nbsp;</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

  if (!tooltip) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
