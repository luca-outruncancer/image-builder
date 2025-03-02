"use client"

import type React from "react"
import { X } from "lucide-react"
import { useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface ModalLayoutProps {
  isOpen: boolean
  title: string
  children: React.ReactNode
  customButtons?: React.ReactNode
  onNext?: () => void
  nextLabel?: string
  description?: string
  size?: "sm" | "md" | "lg" | "xl"
  onClose?: () => void
  theme?: "light" | "dark"
}

export default function ModalLayout({
  isOpen,
  title,
  children,
  customButtons,
  onNext,
  nextLabel = "Next",
  description,
  size = "md",
  onClose,
  theme = "light",
}: ModalLayoutProps) {
  const handleClose = () => {
    if (onClose) {
      onClose()
    } else {
      window.location.reload()
    }
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Handle escape key press
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose()
      }
    }

    document.addEventListener("keydown", handleEscapeKey)
    return () => document.removeEventListener("keydown", handleEscapeKey)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  // Size classes for the modal
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  }

  // Theme-specific styles
  const themeStyles = {
    light: {
      background: "bg-white",
      text: "text-gray-900",
      border: "border-gray-200",
      separator: "bg-gray-200",
      closeButton: "hover:bg-gray-100 text-gray-500 hover:text-gray-900",
    },
    dark: {
      background: "bg-gray-900",
      text: "text-white",
      border: "border-gray-700",
      separator: "bg-gray-700",
      closeButton: "hover:bg-gray-800 text-gray-400 hover:text-white",
    }
  };

  const activeTheme = themeStyles[theme];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur effect */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
        onClick={handleClose}
      />

      {/* Modal container */}
      <div
        className={cn(
          "relative z-50 flex flex-col w-full rounded-xl border shadow-xl animate-in fade-in-0 zoom-in-95 duration-200",
          activeTheme.background,
          activeTheme.border,
          sizeClasses[size],
          "max-h-[85vh]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col space-y-1.5 p-6">
          <div className="flex items-center justify-between">
            <h2 className={cn("text-2xl font-semibold leading-none tracking-tight", activeTheme.text)}>{title}</h2>
            <button
              onClick={handleClose}
              className={cn("inline-flex items-center justify-center rounded-full w-8 h-8 transition-colors", activeTheme.closeButton)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          {description && <p className={cn("text-sm", theme === "light" ? "text-gray-500" : "text-gray-400")}>{description}</p>}
        </div>

        <div className={cn("h-px w-full", activeTheme.separator)} />

        {/* Content with scrolling */}
        <div className={cn("flex-1 overflow-auto p-6 pt-4", activeTheme.text)}>{children}</div>

        {/* Footer */}
        {(customButtons || onNext) && (
          <>
            <div className={cn("h-px w-full", activeTheme.separator)} />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4">
              {customButtons || (
                <>
                  <Button
                    variant={theme === "light" ? "outline" : "secondary"}
                    onClick={handleClose}
                    className="mt-2 sm:mt-0"
                  >
                    Cancel
                  </Button>
                  {onNext && (
                    <Button variant="primary" onClick={onNext}>
                      {nextLabel}
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
