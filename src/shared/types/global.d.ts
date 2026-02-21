import type { ChatApi } from './chat'

declare global {
  interface Window {
    aiChat: ChatApi
  }
}

export {}
