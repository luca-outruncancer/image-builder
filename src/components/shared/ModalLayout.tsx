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
          "relative z-50 flex flex-col w-full rounded-xl border bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-200",
          sizeClasses[size],
          "max-h-[85vh]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col space-y-1.5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold leading-none tracking-tight text-foreground">{title}</h2>
            <button
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-full w-8 h-8 transition-colors hover:bg-gray-100"
            >
              <X className="h-4 w-4 text-gray-500 hover:text-gray-900" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>

        <Separator />

        {/* Content with scrolling */}
        <div className="flex-1 overflow-auto p-6 pt-4">{children}</div>

        {/* Footer */}
        {(customButtons || onNext) && (
          <>
            <Separator />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4">
              {customButtons || (
                <>
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    className="mt-2 sm:mt-0"
                  >
                    Cancel
                  </Button>
                  {onNext && (
                    <Button onClick={onNext} className="bg-primary text-primary-foreground">
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
