'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ToastState {
  message: string
  type: 'success' | 'error' | 'info'
  id: number
}

let setToastGlobal: ((t: ToastState) => void) | null = null

export function toast(message: string, type: ToastState['type'] = 'success') {
  setToastGlobal?.({ message, type, id: Date.now() })
}

export function Toaster() {
  const [current, setCurrent] = useState<ToastState | null>(null)

  useEffect(() => {
    setToastGlobal = setCurrent
    return () => { setToastGlobal = null }
  }, [])

  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => setCurrent(null), 3000)
    return () => clearTimeout(t)
  }, [current])

  if (!current) return null

  return (
    <div className={cn(
      'fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-sm font-medium shadow-xl z-50 transition-all',
      current.type === 'success' && 'bg-[#00DF76] text-black',
      current.type === 'error' && 'bg-[#ff4d57] text-white',
      current.type === 'info' && 'bg-[#222226] text-white',
    )}>
      {current.message}
    </div>
  )
}
