"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof RadixTooltip.Content>,
  TooltipContentProps
>(({ className = "", sideOffset = 6, children, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={
        "z-[10000] max-w-[280px] rounded-lg bg-white px-3 py-2 text-xs text-gray-700 " +
        "shadow-md border border-gray-100 " +
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out " +
        "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 " +
        "data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95 " +
        className
      }
      {...props}
    >
      {children}
      <RadixTooltip.Arrow className="fill-white drop-shadow-sm" width={10} height={5} />
    </RadixTooltip.Content>
  </RadixTooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";
