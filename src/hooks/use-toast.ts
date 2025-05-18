
import { useState } from 'react'

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  variant?: "default" | "destructive";
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

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

// Create a standalone toast function for direct usage
export const toast = ({
  ...props
}: {
  title?: string
  description?: string
  action?: React.ReactNode
  variant?: "default" | "destructive"
}) => {
  // This is just a placeholder implementation since we can't access the hook state directly
  console.log("Toast:", props)
  return Math.random().toString(36).substring(2, 9)
}
