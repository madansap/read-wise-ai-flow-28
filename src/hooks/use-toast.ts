
import { useState, useEffect } from 'react'
import { toast as originalToast } from "@/components/ui/toast"

export function useToast() {
  const [toasts, setToasts] = useState<any[]>([])

  const toast = ({
    ...props
  }: {
    title?: string
    description?: string
    action?: React.ReactNode
    variant?: "default" | "destructive"
  }) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prevToasts) => [...prevToasts, { id, ...props }])
    return id
  }

  const dismissToast = (id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id))
  }

  return {
    toast,
    dismissToast,
    toasts,
  }
}

// Re-export the toast function from the UI component for direct usage
export { originalToast as toast }
