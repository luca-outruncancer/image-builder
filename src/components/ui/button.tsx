// src/components/ui/button.tsx
import React from "react"
import { cn } from "@/lib/utils"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "outline" | "secondary" | "ghost" | "link" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "bg-black text-white hover:bg-black/90",
      primary: "bg-blue-500 text-white hover:bg-blue-600 shadow-sm",
      outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm",
      secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200",
      ghost: "hover:bg-gray-100 text-gray-700 hover:text-gray-900",
      link: "text-blue-500 underline-offset-4 hover:underline",
      danger: "bg-red-500 text-white hover:bg-red-600"
    }

    const sizeStyles = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 px-3 py-1 text-xs",
      lg: "h-12 px-6 py-3 text-base",
      icon: "h-10 w-10 p-0"
    }

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
        ref={ref}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"
