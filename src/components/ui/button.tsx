import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 no-drag select-none",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80",
        secondary: "bg-elevated text-fg border border-border hover:border-border-strong hover:bg-sunken active:bg-sunken",
        ghost: "text-fg-muted hover:text-fg hover:bg-sunken active:bg-sunken",
        outline: "border border-border text-fg hover:bg-sunken hover:border-border-strong",
        danger: "text-danger hover:bg-danger/10",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-xs",
        lg: "h-10 px-4 text-sm",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
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
  ({ className, variant, size, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} type={type} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
