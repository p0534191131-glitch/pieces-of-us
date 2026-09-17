import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 active:scale-[.97] [&_svg]:pointer-events-none [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-primary-deep text-primary-foreground shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.85),inset_0_1px_0_hsl(var(--foreground)/0.35)] hover:-translate-y-px hover:brightness-110",
        gold: "bg-gradient-to-b from-gold to-gold-deep text-accent-foreground shadow-[0_12px_32px_-14px_hsl(var(--gold)/0.8),inset_0_1px_0_hsl(var(--foreground)/0.45)] hover:-translate-y-px hover:brightness-110",
        secondary:
          "border border-foreground/10 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12]",
        outline: "border border-foreground/15 bg-transparent text-foreground hover:bg-foreground/[0.06]",
        ghost: "text-foreground/80 hover:bg-foreground/[0.07] hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
        link: "rounded-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        default: "h-11 px-6 text-[15px]",
        lg: "h-14 px-8 text-lg",
        xl: "h-16 px-10 text-xl",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? type : (type ?? "button")}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
